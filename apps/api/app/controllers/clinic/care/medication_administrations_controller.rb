module Clinic
  module Care
    class MedicationAdministrationsController < Clinic::ApiController
      def index
        encounter = encounter_scope.includes(:site).find(requested_id!(params[:encounter_id], :encounter_id))
        authorize_read!(encounter)
        posting_available = inventory_posting_available?
        render json: {
          encounter_id: encounter.id,
          site_id: encounter.site_id,
          can_administer: posting_available && can_administer?(encounter),
          inventory_posting_available: posting_available,
          administrations: administrations_for(encounter).map { |administration| MedicationAdministrationSerializer.call(administration) },
          eligible_batches: posting_available ? eligible_batches(encounter).map { |batch| MedicationAdministrationSerializer.eligible_batch(batch) } : []
        }
      end

      def create
        encounter = encounter_scope.includes(:site).find(requested_id!(params[:encounter_id], :encounter_id))
        authorize_create!(encounter)
        input = parameter_hash!(:medication_administration,
          %i[product_id dose_text route_text administration_site_text administered_at request_key],
          nested_arrays: { allocations: %i[batch_id quantity] })
        raw_allocations = input[:allocations]
        unless raw_allocations.is_a?(Array) && raw_allocations.any?
          raise Clinic::Api::RequestParameters::Invalid.new(
            "allocations must include at least one medication batch.", field: :allocations
          )
        end
        allocations = raw_allocations.map.with_index do |allocation, index|
          {
            batch_id: requested_id!(allocation[:batch_id], "allocations.#{index}.batch_id"),
            quantity: decimal_string!(allocation[:quantity], field: "allocations.#{index}.quantity")
          }
        end
        result = Clinic::Care::AdministerMedication.call(
          practice: current_practice,
          actor: current_user,
          encounter: encounter,
          product_id: requested_id!(input[:product_id], :product_id),
          allocations: allocations,
          dose_text: required_string!(input[:dose_text], field: :dose_text, maximum: 500),
          route_text: required_string!(input[:route_text], field: :route_text, maximum: 160),
          administration_site_text: optional_string(input[:administration_site_text], field: :administration_site_text, maximum: 160),
          administered_at: time_param!(input[:administered_at], field: :administered_at),
          request_key: request_key!(input[:request_key])
        )
        render json: {
          medication_administration: MedicationAdministrationSerializer.call(result.medication_administration),
          replayed: result.replayed
        }, status: :created
      end

      private

      def encounter_scope
        current_practice.encounters
      end

      def administrations_for(encounter)
        MedicationAdministration.where(practice_id: current_practice.id, encounter_id: encounter.id)
          .includes(:movement_links).order(administered_at: :desc, id: :desc)
      end

      def eligible_batches(encounter)
        return Clinic::Inventory::PharmacyBatch.none unless encounter.site_id

        Clinic::Inventory::PharmacyBatch.where(practice_id: current_practice.id)
          .joins(:product, :location_record)
          .where(clinic_pharmacy_products: { category: "medication", active: true })
          .where(clinic_inventory_locations: { site_id: encounter.site_id })
          .usable(current_practice.inventory_date)
          .where("clinic_pharmacy_batches.on_hand > 0")
          .includes(:product, :lot, :location_record)
          .order("clinic_pharmacy_products.name ASC, clinic_pharmacy_batches.expires_on ASC, clinic_pharmacy_batches.id ASC")
      end

      def authorize_read!(encounter)
        Clinic::Authorization.authorize!(actor: current_user, practice: current_practice,
          action: "notes.read", site: encounter.site)
        Clinic::Authorization.authorize!(actor: current_user, practice: current_practice,
          action: "inventory.read")
      end

      def authorize_create!(encounter)
        Clinic::Authorization.authorize!(actor: current_user, practice: current_practice,
          action: "notes.write", site: encounter.site)
        Clinic::Authorization.authorize!(actor: current_user, practice: current_practice,
          action: "inventory.adjust")
      end

      def can_administer?(encounter)
        ability = Ability.new(current_user, practice: current_practice)
        encounter.site.present? && ability.allowed_permission?("notes.write", site: encounter.site) &&
          ability.allowed_permission?("inventory.adjust")
      end

      def inventory_posting_available?
        profile = current_practice.inventory_profiles.order(version: :desc).first
        profile && %w[configured synthetic].include?(profile.status) && Array(profile.capabilities).include?("inventory")
      end

      def request_key!(value)
        key = required_string!(value, field: :request_key, maximum: 160)
        return key if key.match?(Clinic::Idempotency::KEY_PATTERN)

        raise Clinic::Api::RequestParameters::Invalid.new(
          "request_key must match the clinic idempotency key format.", field: :request_key
        )
      end

      def sensitive_read_action
        action_name == "index" ? "notes.read" : super
      end
    end
  end
end
