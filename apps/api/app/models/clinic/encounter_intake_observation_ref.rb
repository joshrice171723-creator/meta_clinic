module Clinic
  class EncounterIntakeObservationRef < ApplicationRecord
    self.table_name = "clinic_encounter_intake_observation_refs"
    include TenantScoped
    include AppendOnly

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :encounter, class_name: "Clinic::Encounter"
    belongs_to :intake_revision, class_name: "Clinic::EncounterIntakeRevision"
    belongs_to :observation, class_name: "Clinic::Care::Observation"

    validate :context_matches

    private

    def context_matches
      [ intake_revision, observation ].compact.each do |record|
        errors.add(:base, "Intake evidence must belong to this practice and patient") unless
          record.practice_id == practice_id && record.patient_id == patient_id
      end
      if intake_revision && intake_revision.encounter_id != encounter_id
        errors.add(:intake_revision, "must belong to this encounter")
      end
      if observation && observation.encounter_id != encounter_id
        errors.add(:observation, "must belong to this encounter")
      end
    end
  end
end
