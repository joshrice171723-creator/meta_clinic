module Clinic
  class CreditNote < ApplicationRecord
    self.table_name = "clinic_credit_notes"
    include TenantScoped
    include AppendOnly

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :invoice, class_name: "Clinic::Invoice"

    validates :currency, presence: true, format: { with: /\A[A-Z]{3}\z/ }
    validates :amount, numericality: { greater_than: 0 }
    validate :invoice_belongs_to_patient

    private

    def invoice_belongs_to_patient
      return unless invoice

      errors.add(:invoice, "must belong to this practice") if invoice.practice_id != practice_id
      errors.add(:invoice, "must belong to this patient") if invoice.patient_id != patient_id
    end
  end
end
