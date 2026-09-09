module Clinic
  class PaymentEvent < ApplicationRecord
    self.table_name = "clinic_payment_events"
    include TenantScoped
    include AppendOnly

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    has_many :allocations, class_name: "Clinic::PaymentAllocation", dependent: :restrict_with_error
    has_many :refund_events, class_name: "Clinic::RefundEvent", dependent: :restrict_with_error
    has_one :cash_tender, class_name: "Clinic::CashTender", dependent: :restrict_with_error
    has_many :billing_receipts, class_name: "Clinic::BillingReceipt", dependent: :restrict_with_error

    validates :currency, presence: true, format: { with: /\A[A-Z]{3}\z/ }
    validates :amount, numericality: { greater_than: 0 }
    validates :external_event_reference, presence: true, uniqueness: { scope: :practice_id }
  end
end
