module Clinic
  module Reports
    class PrescriptionSimulatorActivity
      def self.call(practice:, actor:)
        Clinic::Authorization.authorize!(actor:, practice:, action: "clinical_records.read")
        attempts = Clinic::Care::PrescriptionTransmissionAttempt.where(practice:)
        counts = attempts.group(:outcome).count
        {
          source: "clinic_prescription_transmission_attempts", adapter: Clinic::Care::PrescriptionTransmissionAttempt::ADAPTER,
          as_of: Time.current.iso8601(6), freshness: "live_source_query_no_cache",
          total: counts.values.sum, outcome_counts: counts,
          unknown_outcome_count: counts.fetch("unknown", 0) + counts.fetch("outcome_unknown", 0),
          latest_submitted_at: attempts.maximum(:submitted_at)&.iso8601(6)
        }
      end
    end
  end
end
