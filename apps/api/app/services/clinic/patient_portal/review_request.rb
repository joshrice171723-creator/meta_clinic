module Clinic
  module PatientPortal
    class ReviewRequest
      OPERATION_CODE = "patient_portal.request.review".freeze
      TRANSITIONS = {
        "pending" => %w[in_review resolved declined],
        "in_review" => %w[resolved declined]
      }.freeze

      AUTHORIZATION_ACTIONS = {
        "message" => "billing.write",
        "refill" => "medication_requests.write",
        "callback" => "appointments.write"
      }.freeze

      def self.call(practice:, actor:, request:, status:, review_note: nil, request_key:,
        decision: nil, patient_message: nil, reconciliation_acknowledged: false, reconciliation_note: nil,
        encounter: nil)
        authorization_action = AUTHORIZATION_ACTIONS.fetch(request.request_type)
        authorization = lambda {
          Clinic::Authorization.authorize!(
            actor: actor,
            practice: practice,
            action: authorization_action,
            any_site: !request.callback?
          )
          ensure_clinical_reviewer!(practice, actor) if request.refill? && status.in?(%w[resolved declined])
        }
        authorization.call
        operation_payload = if !request.refill?
          {
            patient_portal_request_id: request.id,
            status: status,
            review_note: review_note
          }
        else
          {
            patient_portal_request_id: request.id,
            status: status,
            decision: decision,
            patient_message: patient_message,
            reconciliation_acknowledged: reconciliation_acknowledged,
            reconciliation_note: reconciliation_note,
            encounter_id: encounter&.id
          }
        end
        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: OPERATION_CODE,
          request_key: request_key,
          payload: operation_payload,
          resource: request,
          authorization: authorization,
          authorization_action: authorization_action,
          result_resource: ->(record) { record },
          resource_resolver: ->(practice:, receipt:) {
            practice.patient_portal_requests.find_by(id: receipt.resource_id)
          }
        ) do
          current = practice.patient_portal_requests.lock.find(request.id)
          if current.callback? && status.in?(%w[resolved declined]) && review_note.to_s.strip.empty?
            raise ArgumentError, "Record the actual contact outcome before closing this callback request."
          end
          allowed = TRANSITIONS.fetch(current.status) { [] }
          unless allowed.include?(status)
            raise ArgumentError, "This support request cannot transition from #{current.status.humanize.downcase}."
          end

          stored_review_note = current.refill? ? refill_outcome(
            status: status,
            decision: decision,
            patient_message: patient_message,
            reconciliation_acknowledged: reconciliation_acknowledged,
            reconciliation_note: reconciliation_note
          ) : review_note.presence
          medication_revision = if current.refill? && status == "resolved"
            raise ArgumentError, "Choose the open encounter that owns this medication order." unless encounter

            details = RefillRequestData.parse_content(current.content)
            RefillMedicationRequest.call(
              practice:, actor:, request: current, encounter:,
              attributes: { medication_name: details["medication_name"], instructions: patient_message },
              request_key:
            )
          end
          current.update!(
            status: status,
            reviewed_at: Current.business_time,
            review_note: stored_review_note,
            source_encounter: medication_revision ? encounter : current.source_encounter,
            medication_request_revision: medication_revision || current.medication_request_revision
          )
          DeliverRefillResponse.call(
            practice:, actor:, request: current, request_key: "#{request_key}:delivery"
          ) if current.refill? && status.in?(%w[resolved declined])
          Clinic::AuditRecorder.record!(
            practice: practice,
            actor: actor,
            action_code: "patient_portal.#{current.refill? ? 'refill' : current.callback? ? 'callback' : 'billing_support'}.#{status}",
            outcome: :committed,
            resource_version_ref: "#{current.class.name}:#{current.id}"
          )
          current
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def self.refill_outcome(status:, decision:, patient_message:, reconciliation_acknowledged:, reconciliation_note:)
        return nil if status == "in_review"

        valid_decisions = status == "declined" ? %w[declined] : %w[approved changed]
        unless valid_decisions.include?(decision)
          raise ArgumentError, "decision must be one of: #{valid_decisions.join(', ')}."
        end
        message = patient_message.to_s.strip
        raise ArgumentError, "A patient-visible outcome is required." if message.empty?
        if %w[approved changed].include?(decision) && reconciliation_acknowledged != true
          raise ArgumentError, "Medication reconciliation must be acknowledged before approving or changing this request."
        end

        RefillRequestData.outcome(
          decision: decision,
          patient_message: message,
          reconciliation_acknowledged: reconciliation_acknowledged == true,
          reconciliation_note: reconciliation_note.to_s.strip.presence
        )
      end
      private_class_method :refill_outcome

      def self.ensure_clinical_reviewer!(practice, actor)
        membership = Clinic::Membership.active.includes(:clinician_profile)
          .find_by(practice_id: practice.id, user_id: actor.id)
        return if membership&.clinician_profile&.display_name.present?

        raise Clinic::Authorization::Denied,
          "A named clinician profile is required to record a terminal refill decision."
      end
      private_class_method :ensure_clinical_reviewer!
    end
  end
end
