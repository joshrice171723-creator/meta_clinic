module Clinic
  module Reminders
    module Providers
      module Synthetic
        def self.send(reminder:, idempotency_key:)
          return { status: :outage } if ENV["APPLY_REMINDERS_SYNTHETIC_OUTAGE"] == "1"
          return { status: :gated } unless ENV["APPLY_REMINDERS_SYNTHETIC_DELIVERY"] == "1"

          { status: :accepted, provider_message_id: "synthetic-#{Digest::SHA256.hexdigest(idempotency_key)[0, 20]}" }
        end
      end
    end
  end
end
