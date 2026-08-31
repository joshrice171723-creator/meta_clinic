module Clinic
  class InvoiceLine < ApplicationRecord
    self.table_name = "clinic_invoice_lines"
    include TenantScoped
    include AppendOnly

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :invoice, class_name: "Clinic::Invoice"

    validates :quantity, :unit_amount, :posted_amount, numericality: { greater_than_or_equal_to: 0 }
    validates :quantity, numericality: { greater_than: 0 }
    validates :description_snapshot, presence: true
    validate :invoice_belongs_to_patient

    private

    def invoice_belongs_to_patient
      return unless invoice

      errors.add(:invoice, "must belong to this practice") if invoice.practice_id != practice_id
      errors.add(:invoice, "must belong to this patient") if invoice.patient_id != patient_id
    end
  end
end
