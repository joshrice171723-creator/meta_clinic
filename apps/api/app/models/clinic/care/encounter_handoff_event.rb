module Clinic
  module Care
    class EncounterHandoffEvent < ApplicationRecord
      self.table_name = "clinic_encounter_handoff_events"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter"
      belongs_to :encounter_handoff, class_name: "Clinic::Care::EncounterHandoff"
      belongs_to :actor_membership, class_name: "Clinic::Membership"

      validates :event_code, inclusion: { in: %w[requested accepted rejected correction_requested completed] }
      validates :to_state, inclusion: { in: Clinic::Care::EncounterHandoff::STATES }
      validates :handoff_version, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
      validates :request_key, :occurred_at, presence: true
      validate :context_matches

      private

      def context_matches
        records = [ patient, encounter, encounter_handoff, actor_membership ].compact
        errors.add(:base, "Handoff event context must belong to one practice") if records.any? { |record| record.practice_id != practice_id }
        errors.add(:base, "Handoff event must belong to this patient and encounter") if encounter_handoff &&
          (encounter_handoff.patient_id != patient_id || encounter_handoff.encounter_id != encounter_id)
      end
    end
  end
end
