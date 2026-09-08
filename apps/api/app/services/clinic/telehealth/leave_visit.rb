module Clinic
  module Telehealth
    module LeaveVisit
      module_function

      def call(visit:, participant:, request_key:, expected_version:, actor: nil, identity: nil)
        payload = { visit_id: visit.id, participant_id: participant.id, expected_version: expected_version }
        if actor
          authorize_staff!(visit:, participant:, actor:)
          outcome = Clinic::Idempotency.execute(practice: visit.practice, actor: actor,
            operation_code: "telehealth.leave", request_key: request_key, payload: payload, resource: participant,
            authorization_action: "telehealth.participate",
            authorization: -> { authorize_staff!(visit:, participant:, actor:) },
            result_resource: ->(value) { value },
            resource_resolver: ->(practice:, receipt:) {
              Participant.find_by(practice_id: practice.id, id: receipt.resource_id)
            }) { leave!(visit:, participant:, expected_version:) }
        else
          outcome = PatientIdempotency.execute(identity: identity, visit: visit,
            operation_code: "telehealth.leave", request_key: request_key, payload: payload,
            result_kind: "participant") do
            raise Clinic::Authorization::Denied unless participant.portal_identity_id == identity.id
            leave!(visit:, participant:, expected_version:)
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def leave!(visit:, participant:, expected_version:)
        result = nil
        visit.practice.appointments.lock.find(visit.appointment_id).with_lock do
          locked = Visit.lock.find(visit.id)
          raise ActiveRecord::StaleObjectError.new(locked, "update") unless locked.lock_version == expected_version.to_i
          target = locked.participants.lock.find(participant.id)
          target.update!(status: "left", last_seen_at: Time.current) unless target.removed?
          target.join_grants.where(revoked_at: nil).find_each do |grant|
            grant.update!(revoked_at: Time.current, revocation_reason: "participant_left")
          end
          result = target
        end
        result
      end

      def authorize_staff!(visit:, participant:, actor:)
        membership = AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit,
          action: :participate)
        raise Clinic::Authorization::Denied unless participant.membership_id == membership.id
      end
    end
  end
end
