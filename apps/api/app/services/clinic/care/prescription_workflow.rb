module Clinic
  module Care
    module PrescriptionWorkflow
      module_function

      def events(order)
        ids = MedicationRequestRevision.where(practice_id: order.practice_id, series_id: order.series_id).select(:id)
        PrescriptionEvent.where(practice_id: order.practice_id, medication_request_revision_id: ids).order(:id)
      end

      def unresolved?(order)
        events(order).where.not(kind: "review").last&.kind.in?(%w[unknown acknowledged])
      end

      def record(practice:, actor:, order:, kind:, source:, request_key:, prior_event_id: nil, note: nil)
        authorize!(practice, actor, order)
        raise ArgumentError, "Transmission is unavailable. Use the explicitly labeled simulator to exercise an outcome." unless source.in?(%w[manual simulation])
        if source == "manual" && !kind.in?(%w[review confirmed_not_sent cancelled])
          raise ArgumentError, "Manual evidence cannot claim vendor acceptance."
        end
        raise ArgumentError, "Prescription review must be recorded by the reviewing clinician, not simulated." if kind == "review" && source != "manual"
        payload = { order_id: order.id, kind:, source:, prior_event_id:, note: }
        result = Clinic::Idempotency.execute(practice:, actor:, operation_code: "prescription.event", request_key:, payload:,
          authorization_action: "medication_requests.write", authorization: -> { authorize!(practice, actor, order) },
          result_resource: ->(event) { event }, resource_resolver: ->(practice:, receipt:) { PrescriptionEvent.find_by(practice_id: practice.id, id: receipt.resource_id) }) do
          ApplicationRecord.connection.execute(ApplicationRecord.sanitize_sql_array([
            "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", "clinical-plan:#{practice.id}:medication_requests:#{order.series_id}"
          ]))
          current = MedicationRequestRevision.where(practice:, series_id: order.series_id).order(version_number: :desc).first!
          history = events(order)
          prior = prior_event_id.present? ? history.find(prior_event_id) : nil
          if kind.in?(%w[cancelled confirmed_not_sent])
            raise ArgumentError, "Reconcile the latest unresolved prescription attempt." unless prior && prior == history.where.not(kind: "review").last && prior.kind.in?(%w[unknown acknowledged])
            raise ArgumentError, "Record the reconciliation evidence." if note.to_s.strip.empty?
            if kind == "confirmed_not_sent" && prior.kind == "acknowledged"
              raise ArgumentError, "An acknowledged prescription requires confirmed cancellation before replacement."
            end
            raise ArgumentError, "Simulation evidence must stay simulated." if prior.source == "simulation" && source != "simulation"
          else
            raise ActiveRecord::StaleObjectError.new(order, "prescription action") unless current.id == order.id
            raise ArgumentError, "Confirm the previous prescription outcome before another action." if unresolved?(order)
            validate_release!(order)
            unless kind == "review"
              raise ArgumentError, "Pharmacy attempts require outside-pharmacy fulfillment." unless order.fulfillment_route == "outside_pharmacy"
              ensure_dependencies!(order)
              raise ArgumentError, "Review this exact prescription version first." unless history.exists?(medication_request_revision_id: order.id, kind: "review")
            end
          end
          PrescriptionEvent.create!(practice:, patient_id: order.patient_id, medication_request_revision: order,
            recorded_by_membership: practice.memberships.active.find_by!(user: actor), prior_event: prior,
            kind:, source:, request_key:, note: note.to_s.strip.presence, recorded_at: Current.business_time)
        end
        result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def validate_release!(order)
        raise ArgumentError, "Authorize the current prescription first." unless order.status == "authorized"
        required = %i[medication_name medication_strength medication_form dose_text route_text frequency_text instructions prescribed_quantity quantity_unit fulfillment_route]
        required += %i[pharmacy_name pharmacy_location] if order.fulfillment_route == "outside_pharmacy"
        missing = required.select { |field| order.public_send(field).blank? }
        raise ArgumentError, "Complete prescription instructions: #{missing.join(', ')}." if missing.any? || order.refills.nil?
        unless order.inventory_product_id || (order.medication_code.present? && order.medication_code_system.present? && order.catalog_source.present?)
          raise ArgumentError, "Resolve the medication identity before release; the unmapped draft remains saved."
        end
      end

      def authorize!(practice, actor, order)
        raise ActiveRecord::RecordNotFound unless order.practice_id == practice.id
        Clinic::Authorization.authorize!(actor:, practice:, action: "patients.read", subject: order.patient)
        Clinic::Authorization.authorize!(actor:, practice:, action: "medication_requests.write", site: order.site)
      end

      def ensure_dependencies!(order)
        root = MedicationRequestRevision.where(practice_id: order.practice_id, series_id: order.series_id, version_number: 1).first!
        Clinic::ClinicalTask.where(practice_id: order.practice_id, source_type: "order", source_kind: "medication_request", source_id: root.id,
          state: %w[open claimed in_progress on_hold]).each { |task| Clinic::Care::TaskContinuity.ensure_unblocked!(task) }
      end

      def serialize(event)
        event.slice(:id, :medication_request_revision_id, :prior_event_id, :kind, :source, :note, :recorded_by_membership_id).merge(recorded_at: event.recorded_at.iso8601)
      end
    end
  end
end
