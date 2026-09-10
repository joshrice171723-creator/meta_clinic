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
          can_record_outcome: can_record_outcome?(encounter),
          can_administer: posting_available && can_record_outcome?(encounter),
          inventory_posting_available: posting_available && can_record_outcome?(encounter),
          administrations: administrations_for(encounter).map { |administration| MedicationAdministrationSerializer.call(administration) },
          eligible_orders: eligible_orders(encounter).map { |order| MedicationAdministrationSerializer.eligible_order(order) },
          eligible_batches: posting_available && can_record_outcome?(encounter) ? eligible_batches(encounter).map { |batch| MedicationAdministrationSerializer.eligible_batch(batch) } : [],
          dose_units: MedicationRequestRevision::DOSE_UNITS.map { |code, label| { code:, label: } },
          routes: MedicationRequestRevision::ROUTES.map { |code, label| { code:, label: } },
          administration_sites: MedicationAdministration::ADMINISTRATION_SITES.map { |code, label| { code:, label: } },
          verifier_options: verifier_options(encounter)
        }
      end

      def create
        encounter = encounter_scope.includes(:site).find(requested_id!(params[:encounter_id], :encounter_id))
        status = required_string!(params.dig(:medication_administration, :status), field: :status, maximum: 24)
        authorize_create!(encounter, status)
        input = parameter_hash!(:medication_administration,
          %i[medication_request_revision_id status dose_value dose_unit_code route_code administration_site_code
            administration_site_text status_reason variance_reason precheck_status precheck_notes verification_status
            verified_by_membership_id response_text education_text administered_at request_key],
          nested_arrays: { allocations: %i[batch_id quantity] })
        raw_allocations = input[:allocations].is_a?(Array) ? input[:allocations] : []
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
          medication_request_revision_id: requested_id!(input[:medication_request_revision_id], :medication_request_revision_id),
          status: required_string!(input[:status], field: :status, maximum: 24),
          allocations: allocations,
          dose_value: input[:dose_value].present? ? decimal_string!(input[:dose_value], field: :dose_value) : nil,
          dose_unit_code: optional_string(input[:dose_unit_code], field: :dose_unit_code, maximum: 32),
          route_code: optional_string(input[:route_code], field: :route_code, maximum: 64),
          administration_site_code: optional_string(input[:administration_site_code], field: :administration_site_code, maximum: 64),
          administration_site_text: optional_string(input[:administration_site_text], field: :administration_site_text, maximum: 160),
          status_reason: optional_string(input[:status_reason], field: :status_reason, maximum: 2_000),
          variance_reason: optional_string(input[:variance_reason], field: :variance_reason, maximum: 2_000),
          precheck_status: optional_string(input[:precheck_status], field: :precheck_status, maximum: 32),
          precheck_notes: optional_string(input[:precheck_notes], field: :precheck_notes, maximum: 2_000),
          verification_status: optional_string(input[:verification_status], field: :verification_status, maximum: 32),
          verified_by_membership_id: optional_id(input[:verified_by_membership_id], :verified_by_membership_id),
          response_text: optional_string(input[:response_text], field: :response_text, maximum: 2_000),
          education_text: optional_string(input[:education_text], field: :education_text, maximum: 2_000),
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
          .includes(:movement_links, medication_request_revision: :recorded_by_membership)
          .order(administered_at: :desc, id: :desc)
      end

      def eligible_orders(encounter)
        table = MedicationRequestRevision.table_name
        MedicationRequestRevision.where(practice_id: current_practice.id, patient_id: encounter.patient_id,
          encounter_id: encounter.id).where.not(inventory_product_id: nil)
          .select("DISTINCT ON (#{table}.series_id) #{table}.*")
          .order(Arel.sql("#{table}.series_id, #{table}.version_number DESC, #{table}.id DESC"))
          .includes(:inventory_product, requester_membership: :clinician_profile).to_a
          .select do |order|
            order.status == "authorized" && order.intent == "order" && order.site_id == encounter.site_id &&
              order.requester_membership_id.present? && order.dose_value.present? && order.dose_unit_code.present? &&
              order.route_code.present?
          end
          .sort_by { |order| [ order.scheduled_for || Time.at(0), order.recorded_at, order.id ] }
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
          action: "clinical_records.read", site: encounter.site)
      end

      def authorize_create!(encounter, _status)
        Clinic::Authorization.authorize!(actor: current_user, practice: current_practice,
          action: "medication_administrations.write", site: encounter.site)
      end

      def can_record_outcome?(encounter)
        encounter.site.present? && Ability.new(current_user, practice: current_practice)
          .allowed_permission?("medication_administrations.write", site: encounter.site)
      end

      def verifier_options(encounter)
        current_practice.memberships.active.where.not(user_id: current_user.id)
          .includes(:user, :clinician_profile).order(:id).select do |membership|
            Ability.new(membership.user, practice: current_practice)
              .allowed_permission?("medication_administrations.write", site: encounter.site)
          end.map do |membership|
          {
            id: membership.id,
            label: membership.clinician_profile&.display_name || "Clinical staff ##{membership.id}"
          }
        end
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
