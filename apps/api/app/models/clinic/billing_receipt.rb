module Clinic
  class BillingReceipt < ApplicationRecord
    self.table_name = "clinic_billing_receipts"
    include TenantScoped
    include AppendOnly

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :invoice, class_name: "Clinic::Invoice"
    belongs_to :payment_event, class_name: "Clinic::PaymentEvent"
    belongs_to :issued_by, class_name: "User"
    validates :kind, inclusion: { in: %w[cash_payment cash_refund subscription_payment subscription_refund] }
  end
end
