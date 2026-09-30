module Clinic
  module Configuration
    # A deliberately narrower review contract than the ordinary editor: no
    # clearing references, empty eligibility lists, inferred matches or prices.
    class OfferingImportFields
      TEXT = { "name" => 160, "code" => 50, "contact_instructions" => 500,
        "referral_instructions" => 500, "description" => 500 }.freeze
      BOOLEAN = %w[booking_required requires_room public_visible].freeze
      REFERENCES = %w[visit_type_id billing_service_id site_ids clinician_ids].freeze
      LISTS = %w[site_ids clinician_ids].freeze
      FIELDS = (TEXT.keys + BOOLEAN + REFERENCES + %w[duration_minutes modality]).freeze
      EXCLUDED = [
        "Status and publish/retire transitions require their own operation.",
        "Prices, currency, clinical defaults, protected profiles and settings are not offering update fields.",
        "Reference clearing and empty eligibility lists are excluded; no all-clinician inference.",
        "Only existing active destination references are selectable; no creation, merging or automatic equivalence."
      ].freeze

      def initialize(practice:, actor:)
        @practice, @actor = practice, actor
      end

      def billing_available?
        ability = Ability.new(@actor, practice: @practice)
        %w[billing.catalog.manage billing.read billing.invoice_draft billing.write].any? do |permission|
          ability.allowed_permission?(permission)
        end
      end

      def authorize_billing!
        ability = Ability.new(@actor, practice: @practice)
        permission = %w[billing.catalog.manage billing.read].find { |value| ability.allowed_permission?(value) }
        if permission
          Clinic::Authorization.authorize!(practice: @practice, actor: @actor, action: permission)
        else
          Clinic::Authorization.authorize_with_legacy!(practice: @practice, actor: @actor,
            action: "billing.invoice_draft", legacy_action: "billing.write")
        end
      end

      def catalog
        billing = billing_available?
        authorize_billing! if billing
        result = {
          visit_types: records("visit_type_id").order(:id).map { |row| { id: row.id, label: row.code } },
          sites: records("site_ids").order(:id).map { |row| { id: row.id, label: "#{row.name} (#{row.code})" } },
          clinicians: records("clinician_ids").order(:id).map { |row| { id: row.id, label: row.display_name.presence || row.reference.presence || "Clinician #{row.id}" } },
          billing_services: billing ? records("billing_service_id").order(:id).map { |row|
            { id: row.id, label: "#{row.name} (#{row.code.presence || row.id}) — #{row.unit_amount.to_s('F')} #{row.currency}",
              unit_amount: row.unit_amount.to_s("F"), currency: row.currency }
          } : [],
          billing_available: billing,
          excluded: EXCLUDED + (billing ? [] : [ "Billing reference mapping requires existing billing catalog read authority." ])
        }
        Clinic::AuditRecorder.record!(practice: @practice, actor: @actor, action_code: "facilities.read", outcome: :released)
        Clinic::AuditRecorder.record!(practice: @practice, actor: @actor, action_code: "billing.catalog.read", outcome: :released) if billing
        result
      end

      def current(offering, field)
        case field
        when "site_ids" then offering.offering_sites.pluck(:site_id).sort
        when "clinician_ids" then offering.offering_clinicians.pluck(:clinician_id).sort
        else offering.public_send(field)
        end
      end

      def validate_value!(field, value)
        valid = if TEXT.key?(field)
          value.is_a?(String) && value == value.strip && value.length.between?(1, TEXT.fetch(field))
        elsif BOOLEAN.include?(field)
          value == true || value == false
        elsif field == "duration_minutes"
          value.is_a?(Integer) && value.between?(5, 1440)
        elsif field == "modality"
          %w[in_person video either].include?(value)
        elsif LISTS.include?(field)
          value.is_a?(Array) && value.any? && value.all? { |id| positive_id?(id) } && value == value.uniq.sort
        elsif REFERENCES.include?(field)
          positive_id?(value)
        else
          false
        end
        raise ArgumentError, "Select a supported canonical #{field} value; clearing is excluded." unless valid
      end

      def validate_references!(changes, mappings)
        raise ArgumentError, "Explicit reference mappings are required." unless mappings.is_a?(Array)
        references = changes.select { |change| REFERENCES.include?(change["field"]) }
        expected = references.flat_map do |change|
          field = change.fetch("field")
          source = change["sourceValue"]
          validate_value!(field, source)
          source_ids, target_ids = LISTS.include?(field) ? [source, change["after"]] : [[source], [change["after"]]]
          selected = mappings.select { |mapping| mapping.is_a?(Hash) && mapping["field"] == field }
          raise ArgumentError, "Map only positive explicit source and destination IDs." unless selected.all? { |mapping| mapping.keys.sort == %w[field sourceId targetId] && positive_id?(mapping["sourceId"]) && positive_id?(mapping["targetId"]) }
          raise ArgumentError, "Map every selected source reference exactly once." unless selected.length == source_ids.length && selected.map { |mapping| mapping["sourceId"] }.sort == source_ids
          raise ArgumentError, "Map distinct explicit destination references." unless selected.map { |mapping| mapping["targetId"] }.sort == target_ids
          authorize_billing! if field == "billing_service_id"
          raise ArgumentError, "Selected destination references are no longer eligible." unless records(field).where(id: target_ids).count == target_ids.length
          selected
        end
        raise ArgumentError, "Exclude mappings for unselected fields." unless expected.length == mappings.length
      end

      def validate_destination_references!(attributes)
        REFERENCES.each do |field|
          next unless attributes.key?(field)
          authorize_billing! if field == "billing_service_id"
          ids = LISTS.include?(field) ? attributes[field] : [attributes[field]]
          raise ArgumentError, "Selected destination references are no longer eligible." unless records(field).where(id: ids).count == ids.length
        end
      end

      private

      def records(field)
        case field
        when "visit_type_id" then @practice.visit_types.active
        when "site_ids" then @practice.sites.where(status: "active")
        when "billing_service_id" then @practice.billing_services.where(active: true)
        when "clinician_ids"
          @practice.clinician_profiles.joins(membership: :user)
            .where(clinic_memberships: { active: true, practice_id: @practice.id }, users: { active: true })
        end
      end

      def positive_id?(value)
        value.is_a?(Integer) && value.positive?
      end
    end
  end
end
