module Clinic
  module Care
    class EncounterIntake < ApplicationRecord
      self.table_name = "clinic_encounter_intakes"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter"
      has_many :revisions, class_name: "Clinic::Care::EncounterIntakeRevision", dependent: :restrict_with_error

      validates :encounter_id, uniqueness: { scope: :practice_id }
      validates :current_revision_no, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
      validate :context_matches

      private

      def context_matches
        errors.add(:base, "Intake context must belong to one practice") if [ patient, encounter ].compact.any? { |record| record.practice_id != practice_id }
        errors.add(:encounter, "must belong to this patient") if encounter && encounter.patient_id != patient_id
      end
    end
  end
end
