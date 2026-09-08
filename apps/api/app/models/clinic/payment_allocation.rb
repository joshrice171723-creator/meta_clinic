module Clinic
  class PaymentAllocation < ApplicationRecord
    self.table_name = "clinic_payment_allocations"
    include TenantScoped
    include AppendOnly

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :payment_event, class_name: "Clinic::PaymentEvent"
    belongs_to :invoice, class_name: "Clinic::Invoice"

    validates :amount, numericality: { greater_than: 0 }
    validate :resources_share_patient_and_practice

    private

    def resources_share_patient_and_practice
      { payment_event: payment_event, invoice: invoice }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
        errors.add(attribute, "must belong to this patient") if record && record.patient_id != patient_id
      end
    end
  end
end
