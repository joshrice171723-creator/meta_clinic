module Clinic
  module Telehealth
    module AdmitParticipant
      module_function

      def call(visit:, participant:, actor:, request_key:, expected_version:)
        membership = AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :admit)
        raise Error.new("Only the patient can be admitted from the waiting room.", code: "participant_not_admittable") unless participant.patient?
        outcome = Clinic::Idempotency.execute(practice: visit.practice, actor: actor, operation_code: "telehealth.admit",
          request_key: request_key, resource: visit, authorization_action: "telehealth.host",
          authorization: -> {
            AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :admit)
          },
          payload: { visit_id: visit.id, participant_id: participant.id, expected_version: expected_version },
          result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { Participant.find_by(practice_id: practice.id, id: receipt.resource_id) }) do
          visit.appointment.with_lock do
            locked = Visit.lock.find(visit.id)
            target = locked.participants.lock.find(participant.id)
            raise ActiveRecord::StaleObjectError.new(locked, "update") unless locked.lock_version == expected_version.to_i
            unless locked.scheduled? || locked.in_progress?
              raise Error.new("This video visit cannot admit a patient in its current state.",
                code: "visit_not_admittable", status: :conflict)
            end
            preparation = CurrentPreparation.call(visit: locked)
            unless preparation[:complete] && preparation[:verified] && preparation[:participant]&.id == target.id
              raise Error.new("Verify the current patient preparation before admission.", code: "preparation_not_verified")
            end
            room = locked.current_room_attempt
            raise Error.new("The video room is not ready.", code: "room_not_ready", status: :conflict) unless room&.ready? || room&.active?
            raise Error.new("The patient is not waiting.", code: "participant_not_waiting", status: :conflict) unless target.waiting?
            target.update!(status: "admitted", admitted_by_membership_id: membership.id, admitted_at: Time.current,
              admitted_generation: locked.access_generation, admitted_checkin_id: preparation[:checkin].id)
            locked.update!(status: "in_progress", first_started_at: locked.first_started_at || Time.current)
            target
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
