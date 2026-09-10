module Clinic
  class EncounterWorkflowEvent < ApplicationRecord
    self.table_name = "clinic_encounter_workflow_events"
    include TenantScoped
    include AppendOnly

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :encounter, class_name: "Clinic::Encounter"
    belongs_to :actor_membership, class_name: "Clinic::Membership"

    validates :event_code, inclusion: { in: %w[checked_in] }
    validates :from_stage, :to_stage, inclusion: { in: %w[unrecorded awaiting_intake intake_in_progress triage_in_progress handoff_pending clinician_accepted] }
    validates :workflow_version, numericality: { only_integer: true, greater_than: 0 }
    validates :request_key, :occurred_at, presence: true
    validate :context_matches

    private

    def context_matches
      records = [ patient, encounter, actor_membership ].compact
      errors.add(:base, "Workflow event context must belong to one practice") if records.any? { |record| record.practice_id != practice_id }
      errors.add(:encounter, "must belong to this patient") if encounter && encounter.patient_id != patient_id
    end
  end
end
