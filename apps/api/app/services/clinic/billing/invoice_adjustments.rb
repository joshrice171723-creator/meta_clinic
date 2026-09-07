module Clinic
  module Billing
    class InvoiceAdjustments
      Result = Data.define(:invoice, :credit, :replayed, :request_key)
      BLOCKING_COLLECTION_STATES = %w[pending processing needs_reconciliation succeeded].freeze

      def self.credit(invoice:, actor:, amount:, reason:, request_key:)
        practice = invoice.practice
        authorize!(practice, actor)
        amount = Money.currency_amount(amount, name: "credit", positive: true)
        reason = normalized_reason(reason)
        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: "billing.invoice_credit",
          request_key: request_key,
          payload: { invoice_id: invoice.id, amount: amount.to_s("F"), reason: reason },
          resource: invoice,
          authorization: -> { authorize!(practice, actor) },
          authorization_action: "billing.invoice_post",
          result_resource: ->(credit_note) { credit_note },
          resource_resolver: ->(practice:, receipt:) {
            Clinic::CreditNote.where(practice_id: practice.id).find_by(id: receipt.resource_id)
          }
        ) do
          current = practice.invoices.lock.find(invoice.id)
          raise ArgumentError, "Only a posted invoice can receive a credit." unless current.status == "posted"

          charge_total = current.lines.sum(:posted_amount)
          credited = current.credit_notes.lock.to_a.sum(&:amount)
          raise ArgumentError, "Credit exceeds the invoice's remaining charge total." if credited + amount > charge_total

          membership = Clinic::Membership.active.find_by!(practice: practice, user: actor)
          credit_note = current.credit_notes.create!(
            practice: practice,
            patient: current.patient,
            currency: current.currency,
            amount: amount,
            reason: reason,
            issued_by_membership: membership,
            issued_at: Time.current
          )
          Clinic::AuditRecorder.record!(practice: practice, actor: actor,
            action_code: "billing.invoice_credit", outcome: :committed,
            resource_version_ref: "Clinic::CreditNote/#{credit_note.id}")
          credit_note
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        credit_note = outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed invoice credit is unavailable.")
        Result.new(invoice: credit_note.invoice.reload, credit: credit_note, replayed: outcome.replayed, request_key: request_key)
      end

      def self.void(invoice:, actor:, reason:, request_key:)
        practice = invoice.practice
        authorize!(practice, actor)
        reason = normalized_reason(reason)
        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: "billing.invoice_void",
          request_key: request_key,
          payload: { invoice_id: invoice.id, reason: reason },
          resource: invoice,
          authorization: -> { authorize!(practice, actor) },
          authorization_action: "billing.invoice_post",
          result_resource: ->(voided_invoice) { voided_invoice },
          resource_resolver: ->(practice:, receipt:) { practice.invoices.find_by(id: receipt.resource_id) }
        ) do
          current = practice.invoices.lock.find(invoice.id)
          raise ArgumentError, "Only a posted invoice can be voided." unless current.status == "posted"
          raise ArgumentError, "An invoice with payments or credits cannot be voided." if
            current.payment_allocations.exists? || current.credit_notes.exists?
          if current.payment_collection_intents.where(state: BLOCKING_COLLECTION_STATES).exists?
            raise ArgumentError, "Resolve the invoice's collection activity before voiding it."
          end

          membership = Clinic::Membership.active.find_by!(practice: practice, user: actor)
          current.update!(status: "void", void_reason: reason,
            voided_by_membership: membership, voided_at: Time.current)
          Clinic::AuditRecorder.record!(practice: practice, actor: actor,
            action_code: "billing.invoice_void", outcome: :committed,
            resource_version_ref: "Clinic::Invoice/#{current.id}")
          current
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        voided_invoice = outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed invoice void is unavailable.")
        Result.new(invoice: voided_invoice.reload, credit: nil, replayed: outcome.replayed, request_key: request_key)
      end

      def self.limits(invoice)
        total = invoice.lines.sum(&:posted_amount)
        credited = invoice.credit_notes.sum(&:amount)
        credit_available = invoice.status == "posted" ? [ total - credited, BigDecimal("0") ].max : BigDecimal("0")
        void_eligible = invoice.status == "posted" && invoice.payment_allocations.empty? && invoice.credit_notes.empty? &&
          invoice.payment_collection_intents.none? { |intent| BLOCKING_COLLECTION_STATES.include?(intent.state) }
        { credit_available_amount: credit_available.to_s("F"), void_eligible: void_eligible }
      end

      def self.authorize!(practice, actor)
        Authorization.authorize_with_legacy!(actor: actor, practice: practice,
          action: "billing.invoice_post", legacy_action: "billing.write")
      end
      private_class_method :authorize!

      def self.normalized_reason(value)
        raise ArgumentError, "Adjustment reason must be text." unless value.is_a?(String)

        reason = value.strip
        raise ArgumentError, "Adjustment reason must be between 1 and 500 characters." unless reason.length.between?(1, 500)

        reason
      end
      private_class_method :normalized_reason
    end
  end
end
