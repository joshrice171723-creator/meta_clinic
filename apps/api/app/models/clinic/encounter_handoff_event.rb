module Clinic
  class EncounterHandoffEvent < ApplicationRecord
    self.table_name = "clinic_encounter_handoff_events"
    include TenantScoped
    include AppendOnly

    EVENTS = %w[requested accepted rejected correction_requested completed cancelled].freeze

    belongs_to :handoff, class_name: "Clinic::EncounterHandoff"
    belongs_to :actor_membership, class_name: "Clinic::Membership"

    validates :event_code, inclusion: { in: EVENTS }
    validates :version_number, numericality: { only_integer: true, greater_than: 0 }
    validates :recorded_at, :request_key, :content_digest, presence: true
    validates :request_key, length: { maximum: 160 }, uniqueness: { scope: :practice_id }
    validates :content_digest, format: { with: /\A[0-9a-f]{64}\z/ }
    validate :context_matches

    private

    def context_matches
      if handoff && (handoff.practice_id != practice_id || handoff.patient_id != patient_id || handoff.encounter_id != encounter_id)
        errors.add(:handoff, "must belong to this patient and encounter")
      end
      if actor_membership && actor_membership.practice_id != practice_id
        errors.add(:actor_membership, "must belong to this practice")
      end
    end
  end
end
