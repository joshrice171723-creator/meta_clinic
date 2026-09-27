module Clinic
  module Reports
    class PaymentCollectionActivity
      def self.call(practice:, actor:)
        Clinic::Authorization.authorize_with_legacy!(actor:, practice:, action: "billing.read", legacy_action: "billing.write")
        intents = Clinic::PaymentCollectionIntent.where(practice:)
        counts = intents.group(:state).count
        {
          source: "clinic_payment_collection_intents", as_of: Time.current.iso8601(6),
          freshness: "live_source_query_no_cache", total: counts.values.sum,
          state_counts: Clinic::PaymentCollectionIntent::STATES.keys.index_with { |state| counts.fetch(state, 0) },
          needs_reconciliation_count: counts.fetch("needs_reconciliation", 0),
          latest_updated_at: intents.maximum(:updated_at)&.iso8601(6)
        }
      end
    end
  end
end
