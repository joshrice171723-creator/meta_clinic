module Clinic
  module Care
    class EncounterIntakeItem < ApplicationRecord
      self.table_name = "clinic_encounter_intake_items"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      FIELD_CODES = %w[patient_identity_confirmed visit_reason_confirmed allergy_list_reviewed medication_list_reviewed care_needs_reviewed].freeze
      VALUE_STATES = %w[known not_recorded incomplete unknown declined unable_to_obtain].freeze
      VALUE_TYPES = %w[boolean decimal coded date].freeze

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter"
      belongs_to :intake_revision, class_name: "Clinic::Care::EncounterIntakeRevision"

      validates :field_code, inclusion: { in: FIELD_CODES }, uniqueness: { scope: %i[practice_id intake_revision_id] }
      validates :value_state, inclusion: { in: VALUE_STATES }
      validates :value_type, inclusion: { in: VALUE_TYPES }
      validate :context_matches
      validate :value_shape_matches

      private

      def context_matches
        records = [ patient, encounter, intake_revision ].compact
        errors.add(:base, "Intake item context must belong to one practice") if records.any? { |record| record.practice_id != practice_id }
        errors.add(:encounter, "must belong to this patient") if encounter && encounter.patient_id != patient_id
        if intake_revision && (intake_revision.patient_id != patient_id || intake_revision.encounter_id != encounter_id)
          errors.add(:intake_revision, "must belong to this encounter")
        end
      end

      def value_shape_matches
        values = { "boolean" => boolean_value, "decimal" => decimal_value, "coded" => coded_value, "date" => date_value }
        if value_state == "known"
          errors.add(:base, "Known intake items require exactly their typed value") unless values[value_type].present? || values[value_type] == false
          errors.add(:base, "Intake item has values outside its declared type") if values.except(value_type).values.any?(&:present?)
        elsif values.values.any?(&:present?) || unit_code.present?
          errors.add(:base, "Unknown or incomplete intake items cannot carry a value")
        end
        errors.add(:unit_code, "is only allowed for decimal values") if unit_code.present? && value_type != "decimal"
      end
    end
  end
end
