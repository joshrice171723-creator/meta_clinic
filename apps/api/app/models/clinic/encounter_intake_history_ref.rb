module Clinic
  class EncounterIntakeHistoryRef < ApplicationRecord
    self.table_name = "clinic_encounter_intake_history_refs"
    include TenantScoped
    include AppendOnly

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :encounter, class_name: "Clinic::Encounter"
    belongs_to :intake_revision, class_name: "Clinic::EncounterIntakeRevision"
    belongs_to :history_review, class_name: "Clinic::Care::PatientHistoryReview"

    validate :context_matches

    private

    def context_matches
      [ intake_revision, history_review ].compact.each do |record|
        errors.add(:base, "Intake evidence must belong to this practice and patient") unless
          record.practice_id == practice_id && record.patient_id == patient_id
      end
      if [ intake_revision&.encounter_id, history_review&.encounter_id ].compact.any? { |id| id != encounter_id }
        errors.add(:base, "Intake evidence must belong to this encounter")
      end
    end
  end
end
