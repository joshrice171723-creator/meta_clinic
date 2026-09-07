module Clinic
  class BillingService < ApplicationRecord
    self.table_name = "clinic_billing_services"

    include TenantScoped
    include Auditable

    has_many :invoice_lines, class_name: "Clinic::InvoiceLine", dependent: :restrict_with_error

    validates :name, presence: true, length: { maximum: 160 }
    validates :code, length: { maximum: 50 }, uniqueness: { scope: :practice_id }, allow_nil: true
    validates :description, length: { maximum: 500 }, allow_nil: true
    validates :unit_amount, numericality: { greater_than_or_equal_to: 0 }
    validates :currency, presence: true, format: { with: /\A[A-Z]{3}\z/ }
    validates :active, inclusion: { in: [ true, false ] }
    validates :lock_version, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  end
end
