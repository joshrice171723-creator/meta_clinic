module Clinic
  module PatientPortal
    class RefillResponseDelivery < ApplicationRecord
      self.table_name = "clinic_refill_response_deliveries"
      include Clinic::TenantScoped
      include Clinic::Auditable

      enum :state, { pending: "pending", delivered: "delivered", failed: "failed", retry_pending: "retry_pending" }, validate: true
      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :request, class_name: "Clinic::PatientPortal::Request"

      validates :channel, inclusion: { in: %w[portal] }
      validates :attempt_count, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
      validates :failure_code, inclusion: { in: %w[portal_identity_unavailable] }, allow_nil: true
      validate :records_belong_to_practice

      private

      def records_belong_to_practice
        errors.add(:patient, "must belong to this clinic") if patient && patient.practice_id != practice_id
        return unless request

        errors.add(:request, "must belong to this clinic") if request.practice_id != practice_id
        errors.add(:request, "must belong to this patient") if request.patient_id != patient_id
        errors.add(:request, "must be a terminal refill response") unless request.refill? && request.status.in?(%w[resolved declined])
      end
    end
  end
end
