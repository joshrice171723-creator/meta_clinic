module Clinic
  module Care
    module EncounterIntakeSerializer
      FIELD_DEFINITIONS = [
        [ "patient_identity_confirmed", "Patient identity confirmed" ],
        [ "visit_reason_confirmed", "Visit reason confirmed" ],
        [ "allergy_list_reviewed", "Allergy list reviewed" ],
        [ "medication_list_reviewed", "Medication list reviewed" ],
        [ "care_needs_reviewed", "Care needs reviewed" ]
      ].freeze

      def self.call(intake)
        revision = intake&.revisions&.includes(:items)&.order(revision_no: :desc)&.first
        {
          id: intake&.id&.to_s,
          version: intake&.lock_version || 0,
          field_definitions: FIELD_DEFINITIONS.map do |code, label|
            { field_code: code, label: label, value_type: "boolean",
              allowed_states: Clinic::Care::EncounterIntakeItem::VALUE_STATES }
          end,
          latest_revision: revision && revision_payload(revision)
        }
      end

      def self.revision_payload(revision)
        {
          id: revision.id.to_s,
          revision_no: revision.revision_no,
          completeness_state: revision.completeness_state,
          information_source: revision.information_source,
          author_membership_id: revision.author_membership_id.to_s,
          recorded_at: revision.recorded_at.iso8601(6),
          items: revision.items.order(:field_code, :id).map { |item| item_payload(item) }
        }
      end

      def self.item_payload(item)
        {
          id: item.id.to_s, field_code: item.field_code, value_state: item.value_state,
          value_type: item.value_type, boolean_value: item.boolean_value,
          decimal_value: item.decimal_value&.to_s("F"), coded_value: item.coded_value,
          date_value: item.date_value&.iso8601, unit_code: item.unit_code
        }
      end
      private_class_method :revision_payload, :item_payload
    end
  end
end
