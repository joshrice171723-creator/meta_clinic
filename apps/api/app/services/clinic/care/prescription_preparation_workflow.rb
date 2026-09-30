module Clinic
  module Care
    module PrescriptionPreparationWorkflow
      module_function

      def preparations(order)
        ids = MedicationRequestRevision.where(practice_id: order.practice_id, series_id: order.series_id).select(:id)
        PrescriptionPreparation.where(practice_id: order.practice_id, medication_request_revision_id: ids)
          .includes(:submission_attempt, :pharmacy_destination, :review_event).order(:id)
      end

      def prepare(practice:, actor:, order:, pharmacy_destination_id:, request_key:, mode: "standard", signer_state: nil, reviewer_state: nil)
        PrescriptionWorkflow.authorize!(practice, actor, order)
        mode = mode.to_s
        signer_snapshot, reviewer_snapshot = PrescriptionTransmissionWorkflow.controlled_snapshots!(
          practice:, site: order.site, mode:, signer_state:, reviewer_state:)
        payload = { order_id: order.id, pharmacy_destination_id:, mode:, signer_snapshot:, reviewer_snapshot: }
        result = Clinic::Idempotency.execute(practice:, actor:, operation_code: "prescription.prepare", request_key:, payload:,
          authorization_action: "medication_requests.write", authorization: -> { PrescriptionWorkflow.authorize!(practice, actor, order) },
          result_resource: ->(preparation) { preparation },
          resource_resolver: ->(practice:, receipt:) { PrescriptionPreparation.find_by(practice_id: practice.id, id: receipt.resource_id) }) do
          lock_current!(practice:, order:)
          destination = PharmacyDestination.where(practice:, active: true).lock.find(pharmacy_destination_id)
          validate_ready!(order:, destination:)
          review = PrescriptionWorkflow.events(order).where(medication_request_revision_id: order.id, kind: "review", source: "manual").last
          validate_review!(order:, review:)
          snapshot = destination.snapshot
          PrescriptionPreparation.create!(practice:, patient: order.patient, medication_request_revision: order,
            pharmacy_destination: destination, review_event: review,
            prepared_by_membership: practice.memberships.active.find_by!(user: actor), request_key:,
            prepared_at: Current.business_time, schema_version: PrescriptionTransmissionAttempt::SCHEMA_VERSION,
            destination_snapshot: snapshot, mode:, signer_snapshot:, reviewer_snapshot:,
            payload_digest: digest(order:, review:, destination_snapshot: snapshot, mode:, signer_snapshot:, reviewer_snapshot:))
        end
        result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def lock_current!(practice:, order:)
        ApplicationRecord.connection.execute(ApplicationRecord.sanitize_sql_array([
          "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", "clinical-plan:#{practice.id}:medication_requests:#{order.series_id}"
        ]))
        current = MedicationRequestRevision.where(practice:, series_id: order.series_id).order(version_number: :desc).first!
        raise ActiveRecord::StaleObjectError.new(order, "prescription preparation") unless current.id == order.id
      end

      def validate_ready!(order:, destination:)
        raise ArgumentError, "Confirm the previous prescription outcome before preparing or submitting another prescription." if PrescriptionWorkflow.unresolved?(order)
        raise ArgumentError, "Preparation requires outside-pharmacy fulfillment." unless order.fulfillment_route == "outside_pharmacy"
        PrescriptionWorkflow.validate_release!(order, destination:)
        PrescriptionWorkflow.ensure_dependencies!(order)
      end

      def validate_submission!(preparation:, order:, destination:, mode:, signer_snapshot:, reviewer_snapshot:)
        validate_ready!(order:, destination:)
        validate_review!(order:, review: preparation.review_event)
        raise ArgumentError, "Prepare this exact prescription version and pharmacy first." unless
          preparation.medication_request_revision_id == order.id && preparation.patient_id == order.patient_id &&
          preparation.pharmacy_destination_id == destination.id && preparation.mode == mode
        raise ArgumentError, "This preparation already has a submission attempt. Prepare a new request after resolving its outcome." if preparation.submission_attempt
        current_digest = digest(order:, review: preparation.review_event, destination_snapshot: destination.snapshot,
          mode:, signer_snapshot:, reviewer_snapshot:)
        raise ArgumentError, "The prepared prescription source changed. Prepare it again before submission." unless current_digest == preparation.payload_digest
      end

      def review_current?(order:, review:)
        return false unless review && review.practice_id == order.practice_id && review.patient_id == order.patient_id &&
          review.medication_request_revision_id == order.id && review.kind == "review" && review.source == "manual"
        latest = PrescriptionWorkflow.events(order).where.not(kind: "review").last
        return true unless latest && latest.kind.in?(%w[cancelled confirmed_not_sent])

        review.id > latest.id
      end

      def validate_review!(order:, review:)
        raise ArgumentError, "Review this exact prescription version again after reconciliation before preparing or submitting a replacement." unless review_current?(order:, review:)
      end

      def digest(order:, review:, destination_snapshot:, mode:, signer_snapshot:, reviewer_snapshot:)
        # Local canonical envelope only; no vendor or FHIR wire mapping is selected.
        fields = ClinicalPlanWorkflow::COMMON_FIELDS + ClinicalPlanWorkflow::DEFINITIONS.fetch(:medication_requests).fetch(:fields)
        envelope = { schema_version: PrescriptionTransmissionAttempt::SCHEMA_VERSION, source: "simulation", transaction_type: "NewRx",
          practice_id: order.practice_id, patient_id: order.patient_id, encounter_id: order.encounter_id,
          order_id: order.id, series_id: order.series_id, version_number: order.version_number,
          prescription: order.slice(*fields), review_event_id: review.id, destination: destination_snapshot,
          mode:, signer_snapshot:, reviewer_snapshot: }
        Clinic::Idempotency.payload_digest(envelope, algorithm: Clinic::Idempotency::LEGACY_DIGEST_ALGORITHM)
      end

      def serialize(preparation, order:)
        current = MedicationRequestRevision.where(practice_id: order.practice_id, series_id: order.series_id).order(version_number: :desc).first!
        destination = preparation.pharmacy_destination
        fresh = current.id == preparation.medication_request_revision_id && destination.active? &&
          review_current?(order: current, review: preparation.review_event) &&
          digest(order: current, review: preparation.review_event, destination_snapshot: destination.snapshot,
            mode: preparation.mode, signer_snapshot: preparation.signer_snapshot,
            reviewer_snapshot: preparation.reviewer_snapshot) == preparation.payload_digest
        attempt = preparation.submission_attempt
        preparation.slice(:id, :medication_request_revision_id, :pharmacy_destination_id, :review_event_id,
          :prepared_by_membership_id, :request_key, :payload_digest, :schema_version, :destination_snapshot,
          :mode, :signer_snapshot, :reviewer_snapshot).merge(prepared_at: preparation.prepared_at.iso8601,
            source: "local_preparation", state: attempt ? "submitted" : "prepared", current: fresh,
            submission_attempt_id: attempt&.id, submission_outcome: attempt&.outcome)
      end
    end
  end
end
