module Clinic
  class Invoice < ApplicationRecord
    self.table_name = "clinic_invoices"
    include TenantScoped
    include Auditable

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    has_many :lines, class_name: "Clinic::InvoiceLine", dependent: :restrict_with_error
    has_many :payment_allocations, class_name: "Clinic::PaymentAllocation", dependent: :restrict_with_error
    has_many :credit_notes, class_name: "Clinic::CreditNote", dependent: :restrict_with_error
    has_many :insurance_claims, class_name: "Clinic::InsuranceClaim", dependent: :restrict_with_error

    scope :recent, -> { order(created_at: :desc) }

    STATES = {
      "draft" => %w[posted],
      "posted" => %w[void],
      "void" => []
    }.freeze

    def transition_to!(target)
      target = target.to_s
      raise ArgumentError, "Invoice cannot transition from #{status}." unless STATES.fetch(status, []).include?(target)

      update!(status: target)
    end

    validates :currency, presence: true, format: { with: /\A[A-Z]{3}\z/ }
    validates :rounding_policy_version, :status, presence: true
  end
end
