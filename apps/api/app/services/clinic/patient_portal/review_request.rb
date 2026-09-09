module Clinic
  module PatientPortal
    class ReviewRequest
      OPERATION_CODE = "patient_portal.request.review".freeze
      TRANSITIONS = {
        "pending" => %w[in_review resolved declined],
        "in_review" => %w[resolved declined]
      }.freeze

      def self.call(practice:, actor:, request:, status:, review_note:, request_key:)
        authorization = lambda {
          Clinic::Authorization.authorize!(
            actor: actor,
            practice: practice,
            action: "billing.write",
            any_site: true
          )
        }
        authorization.call
        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: OPERATION_CODE,
          request_key: request_key,
          payload: {
            patient_portal_request_id: request.id,
            status: status,
            review_note: review_note
          },
          resource: request,
          authorization: authorization,
          authorization_action: "billing.write",
          result_resource: ->(record) { record },
          resource_resolver: ->(practice:, receipt:) {
            practice.patient_portal_requests.find_by(id: receipt.resource_id)
          }
        ) do
          current = practice.patient_portal_requests.lock.find(request.id)
          unless current.message?
            raise ArgumentError, "Only billing support messages can be reviewed through this workflow."
          end
          allowed = TRANSITIONS.fetch(current.status) { [] }
          unless allowed.include?(status)
            raise ArgumentError, "This support request cannot transition from #{current.status.humanize.downcase}."
          end

          current.update!(
            status: status,
            reviewed_at: Current.business_time,
            review_note: review_note.presence
          )
          Clinic::AuditRecorder.record!(
            practice: practice,
            actor: actor,
            action_code: "patient_portal.billing_support.#{status}",
            outcome: :committed,
            resource_version_ref: "#{current.class.name}:#{current.id}"
          )
          current
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
