module Clinic
  module Care
    module PrescriptionSimulation
      module_function

      SCHEMA_VERSION = "local-prescription-response-v1".freeze
      SCENARIOS = {
        "NewRx" => %w[acknowledged accepted rejected duplicate],
        "CancelRx" => %w[cancellation_acknowledged cancellation_rejected unknown unavailable],
        "RxFill" => %w[fill_notice unknown unavailable]
      }.freeze
      TEXT = {
        "acknowledged" => "The local simulator acknowledged the prescription. No external acceptance is recorded.",
        "accepted" => "The local simulator accepted the prescription. No external acceptance is recorded.",
        "rejected" => "The local simulator rejected the prescription. No vendor rejection is recorded.",
        "duplicate" => "The local simulator returned a duplicate-request response. No vendor result is recorded.",
        "cancellation_acknowledged" => "The local simulator acknowledged cancellation of the linked attempt. No external cancellation occurred.",
        "cancellation_rejected" => "The local simulator rejected cancellation. The linked prescription remains unresolved.",
        "fill_notice" => "A local simulated RxFill notice was received. Medication, quantity, pickup, delivery and administration are not verified."
      }.freeze

      def response(transaction_type:, scenario:)
        raise ArgumentError, "Choose a supported local response scenario." unless SCENARIOS.fetch(transaction_type, []).include?(scenario)
        received = TEXT.key?(scenario)
        { source: "simulation", source_identity: PrescriptionTransmissionAttempt::ADAPTER,
          schema_version: SCHEMA_VERSION, transaction_type:, outcome: scenario,
          event_kind: received ? "received" : "local_outcome",
          response_code: received ? "local_simulation.#{transaction_type}.#{scenario}" : nil,
          response_text: TEXT[scenario], received_at: received ? Current.business_time : nil }
      end
    end
  end
end
