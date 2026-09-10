module Clinic
  module Care
    class EncounterDiagnosis < ChartCoverageRecord
      self.table_name = "clinic_encounter_diagnoses"
      include Clinic::AppendOnly

      belongs_to :supersedes, class_name: "Clinic::Care::EncounterDiagnosis", optional: true
      encrypts :display_text, :narrative
      validates :status, inclusion: { in: %w[draft asserted entered_in_error] }
      validates :code_system, :code, length: { maximum: 160 }, allow_nil: true
      validates :display_text, :narrative, length: { maximum: 4_000 }, allow_nil: true
      validates :encounter, presence: true
      validate :assertion_boundary
      validate :predecessor_matches_context

      private

      def assertion_boundary
        errors.add(:asserted_at, "is required for an assertion") if status == "asserted" && asserted_at.blank?
        errors.add(:asserted_at, "is only allowed for an assertion") if status != "asserted" && asserted_at.present?
      end

      def predecessor_matches_context
        return unless supersedes

        valid = supersedes.practice_id == practice_id && supersedes.patient_id == patient_id && supersedes.encounter_id == encounter_id
        errors.add(:supersedes, "must belong to this encounter") unless valid
      end
    end
  end
end
