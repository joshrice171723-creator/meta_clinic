module Clinic
  module Reports
    class PaymentCollectionActivity
      def self.call(practice:, actor:)
        Clinic::Authorization.authorize_with_legacy!(actor:, practice:, action: "billing.read", legacy_action: "billing.write")
        intents = Clinic::PaymentCollectionIntent.where(practice:)
        counts = intents.group(:state).count
        amounts = intents.group(:currency, :state).sum(:amount)
        reconciliation = intents.where(state: "needs_reconciliation")
        in_flight = intents.where(state: %w[pending processing])
        {
          source: "clinic_payment_collection_intents", as_of: Time.current.iso8601(6),
          freshness: "live_source_query_no_cache", total: counts.values.sum,
          state_counts: Clinic::PaymentCollectionIntent::STATES.keys.index_with { |state| counts.fetch(state, 0) },
          requested_amounts: amounts.keys.map(&:first).uniq.sort.map { |currency|
            { currency:, states: Clinic::PaymentCollectionIntent::STATES.keys.index_with { |state| amounts.fetch([ currency, state ], 0).to_d.to_s("F") } }
          },
          needs_reconciliation_count: counts.fetch("needs_reconciliation", 0),
          reconciliation_records: reconciliation.order(updated_at: :desc, id: :desc).limit(25)
            .select(:id, :patient_id, :invoice_id, :updated_at).includes(invoice: { encounter: :site })
            .map { |intent|
              { id: intent.id, patient_id: intent.patient_id, invoice_id: intent.invoice_id,
                encounter_id: intent.invoice.encounter_id, updated_at: intent.updated_at.iso8601(6) }
                .merge(Clinic::Billing::InvoiceSerializer.source_location(intent.invoice))
            },
          reconciliation_records_capped: reconciliation.count > 25,
          in_flight_count: in_flight.count,
          in_flight_records: in_flight.order(updated_at: :desc, id: :desc).limit(25)
            .select(:id, :patient_id, :invoice_id, :state, :updated_at).includes(invoice: { encounter: :site })
            .map { |intent|
              { id: intent.id, patient_id: intent.patient_id, invoice_id: intent.invoice_id,
                encounter_id: intent.invoice.encounter_id, state: intent.state, updated_at: intent.updated_at.iso8601(6) }
                .merge(Clinic::Billing::InvoiceSerializer.source_location(intent.invoice))
            },
          in_flight_records_capped: in_flight.count > 25,
          latest_updated_at: intents.maximum(:updated_at)&.iso8601(6)
        }
      end
    end
  end
end
