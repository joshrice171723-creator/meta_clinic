module Clinic
  module Care
    class PrescriptionResponseEvent < ApplicationRecord
      self.table_name = "clinic_prescription_response_events"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :medication_request_revision, class_name: "Clinic::Care::MedicationRequestRevision"
      belongs_to :transmission_attempt, class_name: "Clinic::Care::PrescriptionTransmissionAttempt"
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership"
      belongs_to :lifecycle_request, class_name: "Clinic::Care::PrescriptionLifecycleRequest", optional: true
      belongs_to :resolution_event, class_name: "Clinic::Care::PrescriptionEvent", optional: true

      validates :source, inclusion: { in: [ "simulation" ] }
      validates :source_identity, inclusion: { in: [ PrescriptionTransmissionAttempt::ADAPTER ] }
      validates :schema_version, inclusion: { in: [ PrescriptionSimulation::SCHEMA_VERSION ] }
      validates :request_key, :recorded_at, :attempt_correlation_id, presence: true
      validates :request_key, uniqueness: { scope: :practice_id }
      validates :source_message_id, uniqueness: { scope: %i[practice_id source_identity] }, allow_nil: true
      validates :payload_digest, format: { with: /\A[0-9a-f]{64}\z/ }
      validate :context_matches
      before_update { throw :abort }
      before_destroy { throw :abort }

      def context_matches
        attempt = transmission_attempt
        errors.add(:transmission_attempt, "must retain original simulated prescription identity") unless attempt &&
          attempt.practice_id == practice_id && attempt.patient_id == patient_id &&
          attempt.medication_request_revision_id == medication_request_revision_id &&
          attempt.source == "simulation" && attempt.correlation_id.present? && attempt.correlation_id == attempt_correlation_id
        errors.add(:recorded_by_membership, "must belong to this clinic") unless recorded_by_membership&.practice_id == practice_id
        supported = PrescriptionSimulation::SCENARIOS.fetch(transaction_type, []).include?(outcome)
        errors.add(:outcome, "must be a supported local simulation") unless supported
        received = !outcome.in?(%w[unknown unavailable])
        errors.add(:event_kind, "must distinguish receipt from local no-response evidence") unless event_kind == (received ? "received" : "local_outcome")
        if received
          errors.add(:received_at, "and local response metadata are required") unless received_at && source_message_id.present? && response_code.present? && response_text.present?
          errors.add(:response_code, "must identify the local simulator result") unless response_code == "local_simulation.#{transaction_type}.#{outcome}"
          errors.add(:response_text, "must be the bounded simulator explanation") unless response_text == PrescriptionSimulation::TEXT[outcome]
        elsif received_at || source_message_id || response_code || response_text
          errors.add(:received_at, "must remain unknown without a received response")
        end
        request = lifecycle_request
        if transaction_type == "NewRx"
          errors.add(:lifecycle_request, "does not belong to a submission response") if request || lifecycle_correlation_id
        else
          expected_action = transaction_type == "CancelRx" ? "cancel" : "fill_notice"
          errors.add(:lifecycle_request, "must match the original request") unless request &&
            request.practice_id == practice_id && request.transmission_attempt_id == transmission_attempt_id &&
            request.medication_request_revision_id == medication_request_revision_id && request.action == expected_action &&
            request.correlation_id == lifecycle_correlation_id
        end
        if outcome == "cancellation_acknowledged"
          event = resolution_event
          errors.add(:resolution_event, "must preserve the original simulated cancellation chain") unless event &&
            event.practice_id == practice_id && event.patient_id == patient_id &&
            event.medication_request_revision_id == medication_request_revision_id && event.kind == "cancelled" &&
            event.source == "simulation" && event.prior_event_id == attempt&.prescription_event_id
        elsif resolution_event_id
          errors.add(:resolution_event, "is only allowed for a simulated cancellation acknowledgment")
        end
      end
    end
  end
end
