module Clinic
  class RefundEvent < ApplicationRecord
    self.table_name = "clinic_refund_events"
    include TenantScoped
    include AppendOnly

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :payment_event, class_name: "Clinic::PaymentEvent"

    validates :currency, presence: true, format: { with: /\A[A-Z]{3}\z/ }
    validates :amount, numericality: { greater_than: 0 }
    validates :reason, presence: true, length: { maximum: 200 }
    validate :payment_belongs_to_patient

    private

    def payment_belongs_to_patient
      return unless payment_event

      errors.add(:payment_event, "must belong to this practice") if payment_event.practice_id != practice_id
      errors.add(:payment_event, "must belong to this patient") if payment_event.patient_id != patient_id
    end
  end
end
