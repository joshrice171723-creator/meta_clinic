module Clinic
  module Care
    class SubscriptionProjection
      def self.catalog(practice:)
        families = SubscriptionFamily.where(practice: practice, retired: false).where.not(published_snapshot: nil).index_by(&:id)
        SubscriptionPackage.where(practice: practice, retired: false).includes(:published_version).filter_map do |package|
          version = package.published_version
          next unless version
          terms = version.snapshot
          family = families[terms["family_id"]]
          next unless family
          next if terms["available_from"] && Time.iso8601(terms["available_from"]) > Current.business_time
          next if terms["available_until"] && Time.iso8601(terms["available_until"]) <= Current.business_time
          { id: version.id, number: version.number, program: family.published_snapshot.merge("id" => family.id), terms: terms }
        end.sort_by { |item| [item[:program]["display_order"], item[:program]["id"], item[:terms].fetch("display_order", 0), item[:terms]["package_id"]] }
      end

      def self.agreement(agreement)
        invoice = agreement.invoice
        active = agreement.events.where(kind: "active").order(id: :desc).first
        stripe_checkout = Clinic::Billing::StripeCheckout.find_by(practice: agreement.practice, agreement: agreement)
        canceled = agreement.events.find_by(kind: "canceled")
        {
          id: agreement.id, invoice_id: invoice.id, patient_id: agreement.patient_id,
          version_id: agreement.version_id, state: agreement.current_state,
          terms: agreement.snapshot, amount: agreement.amount.to_s("F"), currency: agreement.currency,
          processor: stripe_checkout ? "stripe" : "development_fixture",
          renewal_status: stripe_checkout&.subscription_status,
          renewal_canceled: stripe_checkout&.cancel_at_period_end || %w[canceled incomplete_expired].include?(stripe_checkout&.subscription_status),
          checkout_status: stripe_checkout&.session_status, last_synced_at: stripe_checkout&.last_synced_at&.iso8601,
          renewal_amount_due: stripe_checkout&.renewal_amount_due&.to_s("F"), renewal_invoice_status: stripe_checkout&.renewal_invoice_status,
          balance: invoice.status == "posted" ? [invoice.lines.sum(:posted_amount) - invoice.payment_allocations.sum(:amount) - invoice.credit_notes.sum(:amount), BigDecimal("0")].max.to_s("F") : "0.0",
          invoice_status: invoice.status, starts_at: active&.details&.fetch("starts_at", nil),
          ends_at: active&.details&.fetch("ends_at", nil), cancellation_effective_at:
            stripe_checkout&.cancel_at_period_end || stripe_checkout&.subscription_status == "canceled" ? active&.details&.fetch("ends_at", nil) : canceled&.details&.fetch("effective_at", nil),
          events: agreement.events.order(:id).map { |event| { kind: event.kind, occurred_at: event.created_at.iso8601 } }
        }
      end
    end
  end
end
