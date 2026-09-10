module Clinic
  class EncounterHandoff < ApplicationRecord
    self.table_name = "clinic_encounter_handoffs"
    include TenantScoped
    include Auditable

    STATES = %w[pending accepted rejected correction_requested completed cancelled].freeze

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :encounter, class_name: "Clinic::Encounter"
    belongs_to :intake_revision, class_name: "Clinic::EncounterIntakeRevision"
    belongs_to :requested_by_membership, class_name: "Clinic::Membership"
    belongs_to :accepted_by_membership, class_name: "Clinic::Membership", optional: true
    has_many :events, class_name: "Clinic::EncounterHandoffEvent", foreign_key: :handoff_id,
      dependent: :restrict_with_error

    validates :state, inclusion: { in: STATES }
    validates :requested_at, presence: true
    validate :context_matches
    validate :state_evidence_matches

    private

    def context_matches
      records = [ patient, encounter, intake_revision, requested_by_membership, accepted_by_membership ].compact
      errors.add(:base, "Handoff context must belong to this practice") if records.any? { |record| record.practice_id != practice_id }
      if encounter && encounter.patient_id != patient_id
        errors.add(:encounter, "must belong to this patient")
      end
      if intake_revision && (intake_revision.patient_id != patient_id || intake_revision.encounter_id != encounter_id)
        errors.add(:intake_revision, "must belong to this patient and encounter")
      end
    end

    def state_evidence_matches
      if state.in?(%w[accepted completed])
        errors.add(:accepted_by_membership, "is required") unless accepted_by_membership
        errors.add(:responded_at, "is required") unless responded_at
      elsif state == "pending"
        errors.add(:base, "A pending handoff cannot have response evidence") if accepted_by_membership || responded_at
      elsif accepted_by_membership || responded_at.nil?
        errors.add(:base, "This handoff state has invalid response evidence")
      end
    end
  end
end
