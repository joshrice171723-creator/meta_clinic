module Clinic
  module Care
    class EncounterTriageEvidence < ApplicationRecord
      self.table_name = "clinic_encounter_triage_evidence"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter"
      belongs_to :author_membership, class_name: "Clinic::Membership"
      belongs_to :intake_revision, class_name: "Clinic::Care::EncounterIntakeRevision", optional: true
      belongs_to :observation, class_name: "Clinic::Care::Observation", optional: true
      belongs_to :history_review, class_name: "Clinic::Care::PatientHistoryReview", optional: true

      validates :evidence_kind, inclusion: { in: %w[intake_revision observation history_review] }
      validates :evidence_state, inclusion: { in: %w[known incomplete unknown unable_to_obtain] }
      validates :recorded_at, presence: true
      validate :source_matches

      private

      def source_matches
        sources = { "intake_revision" => intake_revision, "observation" => observation, "history_review" => history_review }
        errors.add(:base, "Triage evidence requires exactly its declared source") unless sources[evidence_kind] && sources.except(evidence_kind).values.none?
        records = [ patient, encounter, author_membership, *sources.values ].compact
        errors.add(:base, "Triage evidence context must belong to one practice") if records.any? { |record| record.practice_id != practice_id }
        errors.add(:base, "Triage evidence must belong to this patient and encounter") if sources.values.compact.any? {
          |record| record.respond_to?(:patient_id) && (record.patient_id != patient_id || record.encounter_id != encounter_id)
        }
      end
    end
  end
end
