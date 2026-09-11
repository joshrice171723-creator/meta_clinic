require "json"

module Clinic
  module PatientPortal
    module RefillRequestData
      CONTENT_SCHEMA_VERSION = 1
      OUTCOME_SCHEMA_VERSION = 1
      DECISIONS = %w[approved changed declined].freeze

      def self.content(medication_name:, pharmacy_destination:, request_note:, source:)
        JSON.generate(
          schema_version: CONTENT_SCHEMA_VERSION,
          medication_name: medication_name,
          pharmacy_destination: pharmacy_destination,
          request_note: request_note,
          source: source
        )
      end

      def self.outcome(decision:, patient_message:, reconciliation_acknowledged:, reconciliation_note:)
        JSON.generate(
          schema_version: OUTCOME_SCHEMA_VERSION,
          decision: decision,
          patient_message: patient_message,
          reconciliation_acknowledged: reconciliation_acknowledged,
          reconciliation_note: reconciliation_note
        )
      end

      def self.parse_content(value)
        parsed = JSON.parse(value.to_s)
        return {} unless parsed.is_a?(Hash) && parsed["schema_version"] == CONTENT_SCHEMA_VERSION

        parsed.slice("medication_name", "pharmacy_destination", "request_note", "source")
      rescue JSON::ParserError
        {}
      end

      def self.parse_outcome(value)
        parsed = JSON.parse(value.to_s)
        return {} unless parsed.is_a?(Hash) && parsed["schema_version"] == OUTCOME_SCHEMA_VERSION

        parsed.slice("decision", "patient_message", "reconciliation_acknowledged", "reconciliation_note")
      rescue JSON::ParserError
        {}
      end
    end
  end
end
