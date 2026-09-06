module Clinic
  module Billing
    class StripeCheckout < ApplicationRecord
      self.table_name = "clinic_stripe_checkouts"
      include TenantScoped
      include Auditable
      belongs_to :connection, class_name: "Clinic::Billing::StripeConnection"
      belongs_to :agreement, class_name: "Clinic::Care::SubscriptionAgreement"
      belongs_to :collection_intent, class_name: "Clinic::PaymentCollectionIntent"
      validates :account_id, format: { with: /\Aacct_[a-zA-Z0-9]+\z/ }
      validates :application_fee_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
      validate do
        errors.add(:base, "Stripe routing does not match the purchase") unless
          connection.practice_id == practice_id && connection.account_id == account_id &&
          agreement.practice_id == practice_id && collection_intent.practice_id == practice_id &&
          collection_intent.invoice_id == agreement.invoice_id && collection_intent.patient_id == agreement.patient_id
      end
    end
  end
end
