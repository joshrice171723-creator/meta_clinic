module Clinic
  module Care
    class Immunization < ChartCoverageRecord
      self.table_name = "clinic_immunizations"
      include Clinic::AppendOnly

      belongs_to :service_request, class_name: "Clinic::Care::ServiceRequest", optional: true
      encrypts :vaccine_name, :lot_text, :site_text, :outcome_text
      validates :status, inclusion: { in: %w[completed not_done] }
      validates :vaccine_name, presence: true, length: { maximum: 500 }
      validates :lot_text, :site_text, :outcome_text, length: { maximum: 2_000 }, allow_nil: true
      validates :administered_at, presence: true
      validate :service_request_matches_context

      private

      def service_request_matches_context
        return unless service_request

        valid = service_request.practice_id == practice_id && service_request.patient_id == patient_id &&
          service_request.encounter_id == encounter_id && service_request.service_kind == "immunization"
        errors.add(:service_request, "must be an immunization request for this encounter") unless valid
      end
    end
  end
end
