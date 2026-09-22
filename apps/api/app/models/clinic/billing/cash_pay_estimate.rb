module Clinic
  module Billing
    class CashPayEstimate < ApplicationRecord
      self.table_name = "clinic_cash_pay_estimates"
      include Clinic::TenantScoped
      include Clinic::Auditable
      belongs_to :patient, class_name: "Clinic::Care::Patient", optional: true
      belongs_to :supersedes, class_name: "Clinic::Billing::CashPayEstimate", optional: true
      has_many :lines, class_name: "Clinic::Billing::CashPayEstimateLine", dependent: :restrict_with_error
      validates :classification, inclusion: { in: %w[general_estimate gfe_candidate issued_gfe] }
      validates :status, inclusion: { in: %w[draft issued superseded void] }
      validates :currency, format: { with: /\A[A-Z]{3}\z/ }
      validates :revision, numericality: { only_integer: true, greater_than: 0 }
      validate :issued_snapshot
      private
      def issued_snapshot
        return unless status == "issued"
        errors.add(:issued_at, "is required when issued") unless issued_at
        errors.add(:policy_version, "is required for an issued GFE") if classification == "issued_gfe" && policy_version.blank?
      end
    end
  end
end
