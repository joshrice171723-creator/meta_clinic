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
      validates :date_basis, length: { maximum: 500 }, allow_nil: true
      validates :source_price_revision, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
      validates :billing_service, presence: true, if: -> { source_price_revision.present? }
      validate :same_practice
      before_create :reject_issued_change
      before_update :reject_issued_change
      before_destroy :reject_issued_change
      private
      def same_practice
        [ cash_pay_estimate, service_offering, billing_service ].compact.each { |record| errors.add(:base, "Estimate records must belong to one practice.") if record.practice_id != practice_id }
      end

      def reject_issued_change
        original_estimate = if persisted? && will_save_change_to_cash_pay_estimate_id?
          Clinic::Billing::CashPayEstimate.find(cash_pay_estimate_id_in_database)
        end
        return unless [ cash_pay_estimate, original_estimate ].compact.any? { |estimate| estimate.status.in?(%w[issued superseded]) }

        errors.add(:base, "Issued estimate lines cannot be changed.")
        throw :abort
      end
    end
  end
end
