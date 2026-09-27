module Clinic
  module Reports
    class PrescriptionSimulatorActivity
      def self.call(practice:, actor:)
        Clinic::Authorization.authorize!(actor:, practice:, action: "clinical_records.read")
        attempts = Clinic::Care::PrescriptionTransmissionAttempt.where(practice:)
        counts = attempts.group(:outcome).count
        latest_attempts = attempts.where(id: attempts.select("MAX(id)").group(:medication_request_revision_id))
        latest_counts = latest_attempts.group(:outcome).count
        unknown = latest_attempts.where(outcome: %w[unknown outcome_unknown])
        {
          source: "clinic_prescription_transmission_attempts", adapter: Clinic::Care::PrescriptionTransmissionAttempt::ADAPTER,
          as_of: Time.current.iso8601(6), freshness: "live_source_query_no_cache",
          total: counts.values.sum, outcome_counts: counts,
          unknown_outcome_count: counts.fetch("unknown", 0) + counts.fetch("outcome_unknown", 0),
          latest_per_revision_outcome_counts: latest_counts,
          latest_per_revision_unknown_count: latest_counts.fetch("unknown", 0) + latest_counts.fetch("outcome_unknown", 0),
          latest_unknown_records: unknown.joins("INNER JOIN clinic_medication_request_revisions revisions ON revisions.id = clinic_prescription_transmission_attempts.medication_request_revision_id AND revisions.practice_id = clinic_prescription_transmission_attempts.practice_id")
            .order("clinic_prescription_transmission_attempts.id DESC").limit(25)
            .pluck("clinic_prescription_transmission_attempts.id", "clinic_prescription_transmission_attempts.patient_id", :medication_request_revision_id, "revisions.encounter_id", :outcome, :submitted_at)
            .map { |id, patient_id, medication_request_revision_id, encounter_id, outcome, submitted_at|
              { id:, patient_id:, medication_request_revision_id:, encounter_id:, outcome:, submitted_at: submitted_at.iso8601(6) }
            },
          latest_unknown_records_capped: unknown.count > 25,
          latest_submitted_at: attempts.maximum(:submitted_at)&.iso8601(6)
        }
      end
    end
  end
end
