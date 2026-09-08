module Clinic
  module Telehealth
    module ResumeVisit
      module_function

      def call(visit:, actor:, request_key:, expected_version:)
        AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :resume)
        outcome = Clinic::Idempotency.execute(practice: visit.practice, actor: actor, operation_code: "telehealth.resume",
          request_key: request_key, resource: visit, authorization_action: "telehealth.host",
          authorization: -> {
            AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :resume)
          },
          payload: { visit_id: visit.id, expected_version: expected_version }, result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { Visit.find_by(practice_id: practice.id, id: receipt.resource_id) }) do
          visit.appointment.with_lock do
            visit.lock!
            raise ActiveRecord::StaleObjectError.new(visit, "update") unless visit.lock_version == expected_version.to_i
            unless visit.ended? && visit.encounter&.status == "open" && !%w[cancelled no_show completed].include?(visit.appointment.status)
              raise Error.new("This video visit cannot be resumed.", code: "visit_not_resumable", status: :conflict)
            end
            visit.participants.find_each do |participant|
              participant.update!(status: "eligible", admitted_at: nil, admitted_by_membership_id: nil,
                admitted_generation: nil, admitted_checkin_id: nil, revoked_at: nil, revocation_reason: nil)
            end
            visit.update!(status: "scheduled", access_generation: visit.access_generation + 1, current_room_attempt_id: nil,
              last_ended_at: nil, ended_by_membership_id: nil, end_reason_code: nil)
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
