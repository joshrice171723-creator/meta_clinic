module Clinic
  module Billing
    class InvoiceStripeCheckout < ApplicationRecord
      self.table_name = "clinic_invoice_stripe_checkouts"
      include TenantScoped
      include Auditable

      belongs_to :connection, class_name: "Clinic::Billing::StripeConnection"
      belongs_to :invoice, class_name: "Clinic::Invoice"
      belongs_to :collection_intent, class_name: "Clinic::PaymentCollectionIntent"

      validates :account_id, format: { with: /\Aacct_[a-zA-Z0-9]+\z/ }
      validates :session_id, format: { with: /\Acs_test_[a-zA-Z0-9]+\z/ }, allow_nil: true
      validates :session_status, inclusion: { in: %w[open complete expired] }, allow_nil: true
      validates :application_fee_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
      validate :routing_matches_invoice

      scope :active, -> { joins(:collection_intent).where(clinic_payment_collection_intents: { state: %w[pending processing needs_reconciliation] }) }

      private

      def routing_matches_invoice
        return unless connection && invoice && collection_intent

        errors.add(:base, "Stripe routing does not match the invoice") unless
          connection.practice_id == practice_id && connection.account_id == account_id &&
          invoice.practice_id == practice_id && collection_intent.practice_id == practice_id &&
          collection_intent.invoice_id == invoice_id && collection_intent.patient_id == invoice.patient_id
      end
    end
  end
end
