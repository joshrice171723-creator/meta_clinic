module Clinic
  module Billing
    class PostInvoice
      OPERATION_CODE = "billing.invoice_post"

      def self.call(invoice:, actor:, request_key: nil)
        practice = invoice.practice
        Authorization.authorize_with_legacy!(actor: actor, practice: practice, action: "billing.invoice_post", legacy_action: "billing.write")
        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: OPERATION_CODE,
          request_key: request_key || SecureRandom.uuid,
          payload: { invoice_id: invoice.id },
          resource: invoice,
          authorization: -> {
            Authorization.authorize_with_legacy!(actor: actor, practice: practice,
              action: "billing.invoice_post", legacy_action: "billing.write")
          },
          authorization_action: "billing.invoice_post",
          result_resource: ->(posted_invoice) { posted_invoice },
          resource_resolver: ->(practice:, receipt:) {
            practice.invoices.find_by(id: receipt.resource_id)
          }
        ) do
          current = practice.invoices.lock.find(invoice.id)
          raise ArgumentError, "An invoice must have a line before posting." unless current.lines.exists?
          current.transition_to!("posted")
          current
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed invoice is unavailable.")
      end
    end
  end
end
