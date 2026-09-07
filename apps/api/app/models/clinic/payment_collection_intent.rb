module Clinic
  class PaymentCollectionIntent < ApplicationRecord
    self.table_name = "clinic_payment_collection_intents"
    include TenantScoped
    include Auditable

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :invoice, class_name: "Clinic::Invoice"
    has_many :processor_events, class_name: "Clinic::PaymentProcessorEvent",
      dependent: :restrict_with_error
    has_one :invoice_stripe_checkout, class_name: "Clinic::Billing::InvoiceStripeCheckout",
      foreign_key: :collection_intent_id, dependent: :restrict_with_error

    STATES = {
      "pending" => %w[processing canceled needs_reconciliation],
      "processing" => %w[succeeded failed needs_reconciliation canceled],
      "succeeded" => [],
      "failed" => [],
      "needs_reconciliation" => %w[processing succeeded failed canceled],
      "canceled" => []
    }.freeze

    validates :reference, presence: true, format: { with: /\Aci_[a-f0-9]{32}\z/ }, uniqueness: { scope: :practice_id }
    validates :request_key, presence: true, format: { with: Clinic::Idempotency::KEY_PATTERN }, uniqueness: { scope: :practice_id }
    validates :processor, presence: true, format: { with: /\A[a-z][a-z0-9_.-]{0,39}\z/ }
    validates :mode, inclusion: { in: %w[test live] }
    validates :currency, presence: true, format: { with: /\A[A-Z]{3}\z/ }
    validates :amount, numericality: { greater_than: 0 }
    validates :state, inclusion: { in: STATES.keys }
    validate :invoice_and_patient_share_scope
    validate :test_mode_only

    def transition_to!(target)
      target = target.to_s
      with_lock do
        raise ArgumentError, "Collection intent cannot transition from #{state}." unless STATES.fetch(state, []).include?(target)

        update!(state: target)
      end
    end

    def self.ensure_no_active_invoice_checkout!(invoice)
      return unless Clinic::Billing::InvoiceStripeCheckout.active.where(invoice: invoice).exists?

      raise ArgumentError, "Resolve or cancel the online payment before changing this invoice balance."
    end

    private

    def invoice_and_patient_share_scope
      return unless patient && invoice

      errors.add(:invoice, "must belong to this patient") if invoice.patient_id != patient_id
      errors.add(:invoice, "must belong to this practice") if invoice.practice_id != practice_id
    end

    def test_mode_only
      errors.add(:mode, "live collection is not enabled") if mode == "live"
    end
  end
end
