module Clinic
  class CashTender < ApplicationRecord
    self.table_name = "clinic_cash_tenders"
    include TenantScoped
    include AppendOnly

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :payment_event, class_name: "Clinic::PaymentEvent"
    belongs_to :cash_drawer_session, class_name: "Clinic::CashDrawerSession"
    belongs_to :recorded_by, class_name: "User"

    validate :drawer_currency_matches_payment, on: :create

    validates :request_key, presence: true, length: { maximum: 100 }, uniqueness: { scope: :practice_id }
    validates :tendered_amount, numericality: { greater_than: 0 }
    validates :change_amount, numericality: { greater_than_or_equal_to: 0 }

    private

    def drawer_currency_matches_payment
      unless cash_drawer_session&.currency.present? && cash_drawer_session.currency == payment_event&.currency
        errors.add(:cash_drawer_session, "must have the same recorded currency as the payment")
      end
    end
  end
end
