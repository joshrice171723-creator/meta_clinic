module Clinic
  module Care
    class DocumentReview < ChartCoverageRecord
      self.table_name = "clinic_document_reviews"
      include Clinic::Auditable

      belongs_to :document, class_name: "Clinic::Document"
      encrypts :review_note
      validates :status, inclusion: { in: %w[pending reviewed follow_up_needed not_applicable] }
      validates :review_note, length: { maximum: 4_000 }, allow_nil: true
      validate :document_matches_context

      private

      def document_matches_context
        return unless document

        valid = document.practice_id == practice_id && document.patient_id == patient_id &&
          (encounter_id.nil? || document.encounter_id == encounter_id)
        errors.add(:document, "must belong to this patient and optional encounter") unless valid
      end
    end
  end
end
