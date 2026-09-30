module Clinic
  module Care
    module PrescriptionTransmissionWorkflow
      module_function

      def attempts(order)
        ids = MedicationRequestRevision.where(practice_id: order.practice_id, series_id: order.series_id).select(:id)
        PrescriptionTransmissionAttempt.where(practice_id: order.practice_id, medication_request_revision_id: ids)
          .includes(:pharmacy_destination, :prescription_event).order(:id)
      end

      def submit(practice:, actor:, order:, pharmacy_destination_id:, scenario:, request_key:, preparation_id: nil, mode: "standard", signer_state: nil, reviewer_state: nil)
        PrescriptionWorkflow.authorize!(practice, actor, order)
        outcome = scenario.to_s
        raise ArgumentError, "Choose a supported simulator outcome." unless PrescriptionTransmissionAttempt::OUTCOMES.include?(outcome)
        mode = mode.to_s
        raise ArgumentError, "Choose a supported simulation mode." unless PrescriptionTransmissionAttempt::MODES.include?(mode)
        signer_snapshot, reviewer_snapshot = controlled_snapshots!(practice:, site: order.encounter.site,
          mode:, signer_state:, reviewer_state:, outcome:)
        # Preserve the original canonical payload for receipt-only legacy replay.
        # Omitting preparation never authorizes a new attempt.
        payload = { order_id: order.id, pharmacy_destination_id:, scenario: outcome, mode:, signer_snapshot:, reviewer_snapshot: }
        payload[:preparation_id] = preparation_id unless preparation_id.nil?
        result = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "prescription.transmission.submit", request_key:, payload:,
          authorization_action: "medication_requests.write",
          authorization: -> { PrescriptionWorkflow.authorize!(practice, actor, order) },
          result_resource: ->(attempt) { attempt },
          resource_resolver: ->(practice:, receipt:) { PrescriptionTransmissionAttempt.find_by(practice_id: practice.id, id: receipt.resource_id) }
        ) do
          # Idempotency checks an owned exact receipt before entering this new-write block.
          raise ArgumentError, "Prepare this prescription before a new submission." if preparation_id.nil?

          PrescriptionPreparationWorkflow.lock_current!(practice:, order:)
          preparation = PrescriptionPreparation.where(practice:).find(preparation_id)
          destination = PharmacyDestination.where(practice:, active: true).lock.find(pharmacy_destination_id)
          PrescriptionPreparationWorkflow.validate_submission!(preparation:, order:, destination:, mode:, signer_snapshot:, reviewer_snapshot:)
          review = preparation.review_event
          destination_snapshot = preparation.destination_snapshot
          digest = preparation.payload_digest
          prior_attempt = attempts(order).last
          event = PrescriptionWorkflow.record(practice:, actor:, order:, kind: outcome, source: "simulation",
            request_key: "prescription-event:#{request_key}", simulated_submission: true)
          PrescriptionTransmissionAttempt.create!(practice:, patient: order.patient, medication_request_revision: order,
            pharmacy_destination: destination, prescription_event: event, preparation:,
            initiated_by_membership: practice.memberships.active.find_by!(user: actor), request_key:,
            adapter: PrescriptionTransmissionAttempt::ADAPTER, outcome:, mode:, signer_snapshot:, reviewer_snapshot:,
            destination_snapshot:, submitted_at: Current.business_time,
            source: "simulation", transaction_type: "NewRx", schema_version: PrescriptionTransmissionAttempt::SCHEMA_VERSION,
            payload_digest: digest, correlation_id: SecureRandom.uuid, review_event: review, prior_attempt:)
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if result.receipt.outcome_outcome_unconfirmed?

        result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def serialize(attempt)
        attempt.slice(:id, :medication_request_revision_id, :pharmacy_destination_id, :prescription_event_id,
          :adapter, :outcome, :mode, :signer_snapshot, :reviewer_snapshot, :destination_snapshot,
          :request_key, :source, :transaction_type, :schema_version, :payload_digest, :correlation_id, :review_event_id,
          :prior_attempt_id, :preparation_id).merge(submitted_at: attempt.submitted_at.iso8601)
      end

      def controlled_snapshots!(practice:, site:, mode:, signer_state:, reviewer_state:, outcome: nil)
        raise ArgumentError, "Choose a supported simulation mode." unless PrescriptionTransmissionAttempt::MODES.include?(mode)
        return [{}, {}] if mode == "standard"

        unless Configuration::PracticeFeatures.snapshot(practice:, site:).fetch(:service_scope).include?("controlled_medications")
          raise ArgumentError, "Controlled prescription test mode is not configured. The draft remains available without external transmission."
        end
        signer = signer_state.to_s.presence || "active"
        reviewer = reviewer_state.to_s.presence || "active"
        unless %w[active revoked].include?(signer) && %w[active revoked].include?(reviewer)
          raise ArgumentError, "Controlled test signer and reviewer states must be active or revoked."
        end
        if outcome && [signer, reviewer].include?("revoked") && outcome != "revoked"
          raise ArgumentError, "A revoked synthetic signer or reviewer can only produce the revoked outcome."
        end
        if signer == "active" && reviewer == "active" && outcome == "revoked"
          raise ArgumentError, "Record a revoked synthetic signer or reviewer before choosing the revoked outcome."
        end
        [ { identity: "synthetic-signer", state: signer }, { identity: "synthetic-reviewer", state: reviewer } ]
      end
    end
  end
end
