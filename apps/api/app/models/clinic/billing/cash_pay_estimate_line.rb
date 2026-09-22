module Clinic
  module Billing
    class CashPayEstimateLine < ApplicationRecord
      self.table_name = "clinic_cash_pay_estimate_lines"
      include Clinic::TenantScoped
      belongs_to :cash_pay_estimate, class_name: "Clinic::Billing::CashPayEstimate"
      belongs_to :service_offering, class_name: "Clinic::ServiceOffering", optional: true
      belongs_to :billing_service, class_name: "Clinic::BillingService", optional: true
      validates :quantity, numericality: { greater_than: 0 }
      validates :unit_amount, :expected_amount, numericality: { greater_than_or_equal_to: 0 }
      validates :description_snapshot, presence: true, length: { maximum: 500 }
      validate :same_practice
      private
      def same_practice
        [ cash_pay_estimate, service_offering, billing_service ].compact.each { |record| errors.add(:base, "Estimate records must belong to one practice.") if record.practice_id != practice_id }
      end
    end
  end
end
