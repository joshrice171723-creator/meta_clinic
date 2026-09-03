module Clinic
  module Billing
    class PostInvoice
      def self.call(invoice:, actor:)
        Authorization.authorize_with_legacy!(actor: actor, practice: invoice.practice, action: "billing.invoice_post", legacy_action: "billing.write")
        invoice.with_lock do
          raise ArgumentError, "An invoice must have a line before posting." unless invoice.lines.exists?
          invoice.transition_to!("posted")
          invoice
        end
      end
    end
  end
end
