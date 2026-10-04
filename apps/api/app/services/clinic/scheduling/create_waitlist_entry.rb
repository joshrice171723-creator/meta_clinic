module Clinic
  module Scheduling
    class CreateWaitlistEntry
      def self.call(practice:, actor:, attributes:, request_key:, payload:)
        site = attributes.fetch(:site)
        patient = attributes.fetch(:patient)
        Waitlist.authorize!(practice:, actor:, site:)
        raise ArgumentError, "Choose a requested window that has not ended." unless attributes.fetch(:latest_at) > Current.business_time

        result = Clinic::Idempotency.execute(practice:, actor:, operation_code: "waitlist.create", request_key:,
          payload:, resource: patient,
          authorization: -> { Waitlist.authorize!(practice:, actor:, site:) },
          result_resource: ->(entry) { entry },
          resource_resolver: ->(practice:, receipt:) { WaitlistEntry.find_by(practice:, id: receipt.resource_id) }) do
          practice.lock!
          Configuration::StarterProfile.require_visit!(practice:, site:, visit_type: attributes.fetch(:visit_type))
          WaitlistEntry.create!(attributes.merge(practice:))
        end
        result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
