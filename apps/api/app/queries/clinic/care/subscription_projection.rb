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
        project(
          agreement,
          events: agreement.events.order(:id).to_a,
          entitlement_entries: SubscriptionEntitlements.records(agreement).order(:id).to_a,
          allowance_entries: SubscriptionAllowances.records(agreement).order(:id).to_a,
          stripe_checkout: Clinic::Billing::StripeCheckout.find_by(practice: agreement.practice, agreement: agreement)
        )
      end

      def self.collection(agreements)
        values = agreements.to_a
        return [] if values.empty?

        ActiveRecord::Associations::Preloader.new(
          records: values,
          associations: [ :events, { invoice: %i[lines payment_allocations credit_notes] } ]
        ).call
        checkouts = Clinic::Billing::StripeCheckout.where(
          practice_id: values.first.practice_id,
          agreement_id: values.map(&:id)
        ).index_by(&:agreement_id)
        entitlement_entries = SubscriptionEntitlementEntry.where(
          practice_id: values.first.practice_id, agreement_id: values.map(&:id)
        ).order(:id).group_by(&:agreement_id)
        allowance_entries = SubscriptionAllowanceEntry.where(
          practice_id: values.first.practice_id, agreement_id: values.map(&:id)
        ).order(:id).group_by(&:agreement_id)
        values.map do |agreement|
          project(
            agreement,
            events: agreement.events.to_a.sort_by(&:id),
            entitlement_entries: entitlement_entries.fetch(agreement.id, []),
            allowance_entries: allowance_entries.fetch(agreement.id, []),
            stripe_checkout: checkouts[agreement.id]
          )
        end
      end

      def self.project(agreement, events:, stripe_checkout:, entitlement_entries:, allowance_entries:)
        invoice = agreement.invoice
        active = events.reverse.find { |event| event.kind == "active" }
        canceled = events.find { |event| event.kind == "canceled" }
        local_simulator = stripe_checkout &&
          Development::MembershipPaymentSimulator.connection?(stripe_checkout.connection)
        processor = if local_simulator
          "local_membership_simulator"
        elsif stripe_checkout
          "stripe"
        else
          "development_fixture"
        end
        result = {
          id: agreement.id, invoice_id: invoice.id, patient_id: agreement.patient_id,
          version_id: agreement.version_id, state: state_for(events),
          entitlements: SubscriptionEntitlements.project(agreement: agreement, entries: entitlement_entries, state: state_for(events), allowance_entries: allowance_entries),
          terms: agreement.snapshot, amount: agreement.amount.to_s("F"), currency: agreement.currency,
          processor: processor,
          renewal_status: stripe_checkout&.subscription_status,
          renewal_canceled: stripe_checkout&.cancel_at_period_end || %w[canceled incomplete_expired].include?(stripe_checkout&.subscription_status),
          checkout_status: stripe_checkout&.session_status, last_synced_at: stripe_checkout&.last_synced_at&.iso8601,
          renewal_amount_due: stripe_checkout&.renewal_amount_due&.to_s("F"), renewal_invoice_status: stripe_checkout&.renewal_invoice_status,
          balance: invoice.status == "posted" ? [
            invoice.lines.sum { |line| line.posted_amount || 0 } -
              invoice.payment_allocations.sum { |allocation| allocation.amount || 0 } -
              invoice.credit_notes.sum { |credit| credit.amount || 0 },
            BigDecimal("0")
          ].max.to_s("F") : "0.0",
          invoice_status: invoice.status, starts_at: active&.details&.fetch("starts_at", nil),
          ends_at: active&.details&.fetch("ends_at", nil), cancellation_effective_at:
            stripe_checkout&.cancel_at_period_end || stripe_checkout&.subscription_status == "canceled" ? active&.details&.fetch("ends_at", nil) : canceled&.details&.fetch("effective_at", nil),
          events: events.map { |event| { kind: event.kind, occurred_at: event.created_at.iso8601 } }
        }
        if local_simulator
          result[:payment_source] = Development::MembershipPaymentSimulator::SOURCE
          result[:vendor_confirmed] = false
        end
        result
      end

      def self.state_for(events)
        latest = events.last
        return "pending_payment" unless latest
        return "expired" if latest.kind == "active" && Time.iso8601(latest.details.fetch("ends_at")) <= Current.business_time
        return "active" if latest.kind == "canceled" && Time.iso8601(latest.details.fetch("effective_at")) > Current.business_time

        latest.kind
      end

      private_class_method :project
      private_class_method :state_for
    end
  end
end
