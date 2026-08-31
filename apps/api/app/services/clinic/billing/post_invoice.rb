module Clinic
  module Billing
    class PostInvoice
      def self.call(invoice:, actor:)
        Authorization.authorize!(actor: actor, practice: invoice.practice, action: "billing.write")
        invoice.with_lock do
          raise ArgumentError, "An invoice must have a line before posting." unless invoice.lines.exists?
          invoice.transition_to!("posted")
          invoice
        end
      end
    end
  end
end
