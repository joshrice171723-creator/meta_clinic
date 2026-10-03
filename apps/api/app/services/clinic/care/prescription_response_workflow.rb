module Clinic
  module Care
    module PrescriptionResponseWorkflow
      module_function

      def requests(order, readable_by: nil)
        PrescriptionLifecycleRequest.where(practice_id: order.practice_id, medication_request_revision_id: readable_revision_ids(order, readable_by))
          .includes(:response_events).order(:id)
      end

      def response_events(order, readable_by: nil)
        PrescriptionResponseEvent.where(practice_id: order.practice_id, medication_request_revision_id: readable_revision_ids(order, readable_by)).order(:id)
      end

      def revision_ids(order)
        MedicationRequestRevision.where(practice_id: order.practice_id, series_id: order.series_id).select(:id)
      end

      def readable_revision_ids(order, actor)
        return revision_ids(order) unless actor

        ability = Ability.new(actor, practice: order.practice)
        sites = order.practice.sites.select { |site| ability.allowed_permission?("clinical_records.read", site:) }
        MedicationRequestRevision.where(id: revision_ids(order), site_id: sites.map(&:id)).select(:id)
      end

      def request_state(request)
        latest = if request.association(:response_events).loaded?
          request.response_events.max_by(&:id)
        else
          request.response_events.order(:id).last
        end
        return "pending" unless latest
        return "outcome_unknown" if latest.outcome == "unknown"
        return "unavailable" if latest.outcome == "unavailable"

        latest.outcome
      end

      def pending_cancellation?(order)
        requests(order).where(action: "cancel").any? { |request| request_state(request).in?(%w[pending outcome_unknown]) }
      end

      def effective_outcome(attempt)
        response = PrescriptionResponseEvent.where(practice_id: attempt.practice_id, transmission_attempt_id: attempt.id,
          transaction_type: "NewRx", event_kind: "received").order(:id).last
        response&.outcome || attempt.outcome
      end

      def request(practice:, actor:, order:, attempt_id:, action:, request_key:)
        raise ArgumentError, "Choose cancellation or a simulated fill-notice request." unless PrescriptionLifecycleRequest::ACTIONS.include?(action)
        attempt = authorized_attempt!(practice:, actor:, order:, attempt_id:)
        result = execute(practice:, actor:, order:, attempt:, request_key:, operation: "prescription.lifecycle.request",
          payload: { order_id: order.id, attempt_id: attempt.id, action: }, klass: PrescriptionLifecycleRequest) do
          lock_series!(order)
          ensure_original_open!(attempt)
          raise ArgumentError, "Reconcile the original outcome before requesting this lifecycle action." unless effective_outcome(attempt).in?(%w[acknowledged accepted])
          if requests(order).where(transmission_attempt_id: attempt.id, action:).any? { |row| request_state(row).in?(%w[pending outcome_unknown]) }
            raise ArgumentError, "Resolve the existing request using its original correlation before another request."
          end
          PrescriptionLifecycleRequest.create!(practice:, patient: attempt.patient,
            medication_request_revision: attempt.medication_request_revision, transmission_attempt: attempt,
            requested_by_membership: practice.memberships.active.find_by!(user: actor), action:, request_key:,
            correlation_id: SecureRandom.uuid, attempt_correlation_id: attempt.correlation_id,
            schema_version: PrescriptionLifecycleRequest::SCHEMA_VERSION, requested_at: Current.business_time)
        end
        confirmed_value!(result)
      end

      def receive(practice:, actor:, order:, attempt_id:, lifecycle_request_id:, scenario:, request_key:)
        attempt = authorized_attempt!(practice:, actor:, order:, attempt_id:)
        request = lifecycle_request_id && PrescriptionLifecycleRequest.where(practice:, transmission_attempt_id: attempt.id).find(lifecycle_request_id)
        transaction_type = request ? (request.action == "cancel" ? "CancelRx" : "RxFill") : "NewRx"
        raise ArgumentError, "Choose a supported local response scenario." unless PrescriptionSimulation::SCENARIOS.fetch(transaction_type).include?(scenario)
        result = execute(practice:, actor:, order:, attempt:, request_key:, operation: "prescription.response.simulate",
          payload: { order_id: order.id, attempt_id: attempt.id, lifecycle_request_id:, scenario: }, klass: PrescriptionResponseEvent) do
          lock_series!(order)
          ensure_original_open!(attempt)
          existing = PrescriptionResponseEvent.where(practice:, transmission_attempt_id: attempt.id, transaction_type:, event_kind: "received")
          existing = request ? existing.where(lifecycle_request: request) : existing.where(lifecycle_request_id: nil)
          raise ArgumentError, "This request already has a received result. Read or replay its original evidence." if existing.exists?
          if request
            latest_request = requests(order).where(transmission_attempt_id: attempt.id, action: request.action).last
            raise ArgumentError, "A newer lifecycle request superseded this request. Do not apply an out-of-order result." unless latest_request&.id == request.id
            if request_state(request) == "outcome_unknown" && scenario == "unavailable"
              raise ArgumentError, "Unavailability does not resolve an unknown result. Reconcile a received result on the same request and correlation."
            end
          end
          if !request && !attempt.outcome.in?(%w[unknown outcome_unknown])
            raise ArgumentError, "Only an unknown original submission can receive a later simulated NewRx response."
          end
          resolution = if scenario == "cancellation_acknowledged"
            PrescriptionEvent.create!(practice:, patient_id: attempt.patient_id,
              medication_request_revision: attempt.medication_request_revision,
              recorded_by_membership: practice.memberships.active.find_by!(user: actor),
              prior_event: attempt.prescription_event, kind: "cancelled", source: "simulation",
              request_key: "prescription-response:#{request_key}", recorded_at: Current.business_time,
              note: PrescriptionSimulation::TEXT.fetch(scenario))
          end
          create_response!(practice:, actor:, attempt:, request:, transaction_type:, scenario:, request_key:, resolution:)
        end
        confirmed_value!(result)
      end

      def record_submission_response!(practice:, actor:, attempt:)
        # Only new simulator executions call this; receipt replay never fabricates inbound history.
        return unless PrescriptionSimulation::SCENARIOS.fetch("NewRx").include?(attempt.outcome)
        PrescriptionWorkflow.authorize!(practice, actor, attempt.medication_request_revision)
        unless attempt.previously_new_record? && ApplicationRecord.connection.transaction_open?
          raise ArgumentError, "Submission response evidence must be part of the original new simulator transaction."
        end

        create_response!(practice:, actor:, attempt:, request: nil, transaction_type: "NewRx", scenario: attempt.outcome,
          request_key: "submission:#{attempt.request_key}", resolution: nil)
      end

      def create_response!(practice:, actor:, attempt:, request:, transaction_type:, scenario:, request_key:, resolution:)
        metadata = PrescriptionSimulation.response(transaction_type:, scenario:)
        envelope = metadata.merge(practice_id: practice.id, patient_id: attempt.patient_id,
          medication_request_revision_id: attempt.medication_request_revision_id, transmission_attempt_id: attempt.id,
          attempt_correlation_id: attempt.correlation_id, lifecycle_request_id: request&.id,
          lifecycle_correlation_id: request&.correlation_id, request_key:)
        PrescriptionResponseEvent.create!(**metadata, practice:, patient: attempt.patient,
          medication_request_revision: attempt.medication_request_revision, transmission_attempt: attempt,
          lifecycle_request: request, resolution_event: resolution,
          recorded_by_membership: practice.memberships.active.find_by!(user: actor), request_key:,
          attempt_correlation_id: attempt.correlation_id, lifecycle_correlation_id: request&.correlation_id,
          source_message_id: metadata[:received_at] ? "simulation:#{Digest::SHA256.hexdigest("#{practice.id}:#{attempt.id}:#{request_key}")}" : nil,
          payload_digest: Clinic::Idempotency.payload_digest(envelope, algorithm: Clinic::Idempotency::LEGACY_DIGEST_ALGORITHM),
          recorded_at: Current.business_time)
      end

      def authorized_attempt!(practice:, actor:, order:, attempt_id:)
        PrescriptionWorkflow.authorize!(practice, actor, order)
        attempt = PrescriptionTransmissionAttempt.where(practice:, patient_id: order.patient_id,
          medication_request_revision_id: revision_ids(order)).find(attempt_id)
        PrescriptionWorkflow.authorize!(practice, actor, attempt.medication_request_revision)
        unless attempt.source == "simulation" && attempt.correlation_id.present?
          raise ArgumentError, "This historical attempt lacks correlation provenance. Retain its existing reconciliation path; do not infer a response identity."
        end
        attempt
      end

      def ensure_original_open!(attempt)
        latest = PrescriptionWorkflow.events(attempt.medication_request_revision).where.not(kind: "review").last
        raise ArgumentError, "This original attempt has been reconciled or replaced. Retain its history; do not apply an out-of-order response." unless latest&.id == attempt.prescription_event_id
      end

      def lock_series!(order)
        ApplicationRecord.connection.execute(ApplicationRecord.sanitize_sql_array([
          "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", "clinical-plan:#{order.practice_id}:medication_requests:#{order.series_id}"
        ]))
      end

      def execute(practice:, actor:, order:, attempt:, request_key:, operation:, payload:, klass:, &block)
        Clinic::Idempotency.execute(practice:, actor:, operation_code: operation, request_key:, payload:,
          authorization_action: "medication_requests.write", authorization: -> {
            PrescriptionWorkflow.authorize!(practice, actor, order)
            PrescriptionWorkflow.authorize!(practice, actor, attempt.medication_request_revision)
          }, result_resource: ->(record) { record },
          resource_resolver: ->(practice:, receipt:) { klass.find_by(practice_id: practice.id, id: receipt.resource_id) }, &block)
      end

      def confirmed_value!(result)
        raise Clinic::Idempotency::OutcomeUnconfirmed if result.receipt.outcome_outcome_unconfirmed?
        result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def serialize_request(request)
        request.slice(:id, :transmission_attempt_id, :medication_request_revision_id, :action, :request_key,
          :correlation_id, :attempt_correlation_id, :schema_version, :requested_by_membership_id)
          .merge(source: "local_request", requested_at: request.requested_at.iso8601, state: request_state(request),
            automatic_send: false, owner: "Prescriber/support queue")
      end

      def serialize_response(response)
        response.slice(:id, :transmission_attempt_id, :medication_request_revision_id, :lifecycle_request_id,
          :resolution_event_id, :event_kind, :source, :source_identity, :source_message_id, :schema_version,
          :transaction_type, :outcome, :response_code, :response_text, :payload_digest, :attempt_correlation_id,
          :lifecycle_correlation_id, :request_key, :recorded_by_membership_id)
          .merge(recorded_at: response.recorded_at.iso8601, received_at: response.received_at&.iso8601)
      end
      private_class_method :revision_ids, :readable_revision_ids, :create_response!, :authorized_attempt!,
        :ensure_original_open!, :lock_series!, :execute, :confirmed_value!
    end
  end
end
