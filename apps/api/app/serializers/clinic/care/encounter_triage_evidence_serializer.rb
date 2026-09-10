module Clinic
  module Care
    module EncounterTriageEvidenceSerializer
      def self.collection(records)
        records.map do |record|
          {
            id: record.id.to_s, evidence_kind: record.evidence_kind,
            evidence_state: record.evidence_state,
            intake_revision_id: record.intake_revision_id&.to_s,
            observation_id: record.observation_id&.to_s,
            history_review_id: record.history_review_id&.to_s,
            author_membership_id: record.author_membership_id.to_s,
            recorded_at: record.recorded_at.iso8601(6)
          }
        end
      end
    end
  end
end
