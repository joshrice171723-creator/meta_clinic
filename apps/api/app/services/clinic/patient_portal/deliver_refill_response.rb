module Clinic
  module PatientPortal
    class DeliverRefillResponse
      def self.call(practice:, actor:, request:, request_key:)
        authorization = lambda {
          Clinic::Authorization.authorize!(actor:, practice:, action: "medication_requests.write", any_site: true)
        }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "patient_portal.refill_response.deliver", request_key:,
          payload: { patient_portal_request_id: request.id, channel: "portal" }, resource: request,
          authorization:, authorization_action: "medication_requests.write",
          result_resource: ->(delivery) { delivery },
          resource_resolver: ->(practice:, receipt:) { RefillResponseDelivery.find_by(practice:, id: receipt.resource_id) }
        ) do
          current = practice.patient_portal_requests.refill.lock.find(request.id)
          raise ArgumentError, "Only a terminal refill response can be delivered." unless current.status.in?(%w[resolved declined])

          delivery = RefillResponseDelivery.lock.find_or_initialize_by(practice:, request: current)
          delivery.patient = current.patient
          delivery.channel = "portal"
          delivery.attempt_count += 1
          delivery.last_attempted_at = Current.business_time
          identity = Identity.available.find_by(practice:, patient: current.patient)
          if identity&.user&.active?
            current.update!(identity:) unless current.identity_id == identity.id
            delivery.assign_attributes(state: "delivered", delivered_at: Current.business_time, failure_code: nil)
          else
            delivery.assign_attributes(state: "failed", delivered_at: nil, failure_code: "portal_identity_unavailable")
          end
          delivery.save!
          Clinic::AuditRecorder.record!(
            practice:, actor:, action_code: "patient_portal.refill_response.#{delivery.state}",
            outcome: :committed, resource_version_ref: "#{delivery.class.name}:#{delivery.id}"
          )
          delivery
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
