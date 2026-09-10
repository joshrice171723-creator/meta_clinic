module Clinic
  module Care
    class ProcedureRevision < ApplicationRecord
      self.table_name = "clinic_procedure_revisions"
      include Clinic::ClinicalRevision

      STATUSES = %w[planned in_progress completed not_done entered_in_error].freeze
      COMPLICATION_STATES = %w[not_assessed none_reported known unknown unable_to_obtain].freeze

      belongs_to :prior_revision, class_name: name, optional: true
      belongs_to :service_request_revision, class_name: "Clinic::Care::ServiceRequestRevision", optional: true

      encrypts :code_system, :procedure_code, :procedure_display, :outcome_text, :complication_text
      validates :status, inclusion: { in: STATUSES }
      validates :complication_state, inclusion: { in: COMPLICATION_STATES }
      validates :procedure_display, presence: true, length: { maximum: 500 }
      validates :code_system, :procedure_code, length: { maximum: 240 }, allow_nil: true
      validates :outcome_text, :complication_text, length: { maximum: 2_000 }, allow_nil: true
      validate :completion_evidence
      validate :request_context_matches

      private

      def completion_evidence
        errors.add(:performed_at, "is required when a procedure is completed") if status == "completed" && performed_at.blank?
        if complication_state == "known" && complication_text.blank?
          errors.add(:complication_text, "is required when complications are recorded")
        end
      end

      def request_context_matches
        return unless service_request_revision
        expected = [ practice_id, patient_id, encounter_id ]
        actual = [ service_request_revision.practice_id, service_request_revision.patient_id,
          service_request_revision.encounter_id ]
        errors.add(:service_request_revision, "must belong to this encounter") unless actual == expected
      end
    end
  end
end
