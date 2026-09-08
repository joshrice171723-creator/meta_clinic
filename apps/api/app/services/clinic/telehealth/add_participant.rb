module Clinic
  module Telehealth
    module AddParticipant
      module_function

      def call(visit:, actor:, membership_id:, request_key:, expected_version:)
        AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :prepare_room)
        staff_membership = Clinic::Membership.active.find_by!(practice_id: visit.practice_id, id: membership_id)
        role = staff_membership.clinician_profile ? "clinician" : "assistant"
        staff_ability = Ability.new(staff_membership.user, practice: visit.practice)
        unless staff_membership.user.active? && staff_ability.allowed_permission?("telehealth.participate", site: visit.appointment.site)
          raise Clinic::Authorization::Denied
        end
        outcome = Clinic::Idempotency.execute(practice: visit.practice, actor: actor, operation_code: "telehealth.add_participant",
          request_key: request_key, resource: visit, authorization_action: "telehealth.host",
          authorization: -> {
            AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :prepare_room)
            raise Clinic::Authorization::Denied unless Ability.new(staff_membership.user, practice: visit.practice)
              .allowed_permission?("telehealth.participate", site: visit.appointment.site)
          },
          payload: { visit_id: visit.id, membership_id: staff_membership.id, role: role, expected_version: expected_version },
          result_resource: ->(participant) { participant },
          resource_resolver: ->(practice:, receipt:) { Participant.find_by(practice_id: practice.id, id: receipt.resource_id) }) do
          visit.with_lock do
            raise ActiveRecord::StaleObjectError.new(visit, "update") unless visit.lock_version == expected_version.to_i
            participant = visit.participants.find_or_initialize_by(membership_id: staff_membership.id)
            participant.assign_attributes(practice_id: visit.practice_id, role: role, status: "eligible",
              revoked_at: nil, revocation_reason: nil)
            participant.save!
            participant
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
