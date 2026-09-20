module Clinic
  module Care
    module PrescriptionTransmissionWorkflow
      module_function

      def attempts(order)
        ids = MedicationRequestRevision.where(practice_id: order.practice_id, series_id: order.series_id).select(:id)
        PrescriptionTransmissionAttempt.where(practice_id: order.practice_id, medication_request_revision_id: ids)
          .includes(:pharmacy_destination, :prescription_event).order(:id)
      end

      def submit(practice:, actor:, order:, pharmacy_destination_id:, scenario:, request_key:)
        PrescriptionWorkflow.authorize!(practice, actor, order)
        outcome = scenario.to_s
        raise ArgumentError, "Choose a supported simulator outcome." unless PrescriptionTransmissionAttempt::OUTCOMES.include?(outcome)
        payload = { order_id: order.id, pharmacy_destination_id:, scenario: outcome }
        result = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "prescription.transmission.submit", request_key:, payload:,
          authorization_action: "medication_requests.write",
          authorization: -> { PrescriptionWorkflow.authorize!(practice, actor, order) },
          result_resource: ->(attempt) { attempt },
          resource_resolver: ->(practice:, receipt:) { PrescriptionTransmissionAttempt.find_by(practice_id: practice.id, id: receipt.resource_id) }
        ) do
          ApplicationRecord.connection.execute(ApplicationRecord.sanitize_sql_array([
            "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", "clinical-plan:#{practice.id}:medication_requests:#{order.series_id}"
          ]))
          current = MedicationRequestRevision.where(practice:, series_id: order.series_id).order(version_number: :desc).first!
          raise ActiveRecord::StaleObjectError.new(order, "prescription submission") unless current.id == order.id
          raise ArgumentError, "Confirm the previous prescription outcome before another submission." if PrescriptionWorkflow.unresolved?(order)
          destination = PharmacyDestination.where(practice:, active: true).find(pharmacy_destination_id)
          PrescriptionWorkflow.validate_release!(order, destination:)
          raise ArgumentError, "Review this exact prescription version first." unless PrescriptionWorkflow.events(order)
            .exists?(medication_request_revision_id: order.id, kind: "review")
          PrescriptionWorkflow.ensure_dependencies!(order)
          event = PrescriptionWorkflow.record(practice:, actor:, order:, kind: outcome, source: "simulation",
            request_key: "prescription-event:#{request_key}")
          PrescriptionTransmissionAttempt.create!(practice:, patient: order.patient, medication_request_revision: order,
            pharmacy_destination: destination, prescription_event: event,
            initiated_by_membership: practice.memberships.active.find_by!(user: actor), request_key:,
            adapter: PrescriptionTransmissionAttempt::ADAPTER, outcome:,
            destination_snapshot: destination.snapshot, submitted_at: Current.business_time)
        end
        result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def serialize(attempt)
        attempt.slice(:id, :medication_request_revision_id, :pharmacy_destination_id, :prescription_event_id,
          :adapter, :outcome, :destination_snapshot).merge(submitted_at: attempt.submitted_at.iso8601)
      end
    end
  end
end
