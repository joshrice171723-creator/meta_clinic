module Clinic
  module Messaging
    class RecordDelivery
      OUTCOMES = %w[delivered failed unknown].freeze

      def self.call(intent:, provider_event_reference:, outcome:)
        outcome = outcome.to_s
        raise ArgumentError, "Choose a supported delivery outcome." unless OUTCOMES.include?(outcome)

        ApplicationRecord.transaction do
          intent.with_lock do
            existing = intent.delivery_events.find_by(provider_event_reference: provider_event_reference)
            if existing
              return existing if existing.outcome == outcome

              raise ArgumentError, "This provider event reference was already recorded with a different outcome."
            end

            event = intent.delivery_events.create!(
              practice: intent.practice,
              provider_event_reference: provider_event_reference,
              outcome: outcome
            )
            intent.outbox.transition_to!(outcome == "delivered" ? "delivered" : outcome)
            event
          end
        end
      rescue ActiveRecord::RecordNotUnique
        intent.delivery_events.find_by!(provider_event_reference: provider_event_reference)
      end
    end
  end
end
