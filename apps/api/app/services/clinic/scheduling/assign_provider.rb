module Clinic
  module Scheduling
    class AssignProvider
      def self.call(encounter:, actor:, clinician_profile:, request_key:, expected_token:, unassign: false)
        practice = encounter.practice
        Authorization.authorize!(actor: actor, practice: practice, action: "encounters.assign_provider", site: encounter.site)
        payload = { encounter_id: encounter.id, clinician_profile_id: clinician_profile&.id, unassign: unassign, expected_token: expected_token }
        result = Clinic::Idempotency.execute(practice: practice, actor: actor, operation_code: "encounters.assign_provider",
          request_key: request_key, payload: payload, resource: encounter,
          authorization: -> { Authorization.authorize!(actor: actor, practice: practice, action: "encounters.assign_provider", site: encounter.site) },
          authorization_action: "encounters.assign_provider",
          result_resource: ->(value) { value[:participant] unless value[:unassign] },
          resource_resolver: ->(practice:, receipt:) { practice.encounter_participants.find_by(id: receipt.resource_id) }) do
          updated = practice.encounters.lock.find(encounter.id)
          raise ArgumentError, "A completed encounter cannot be assigned." if updated.ended_at.present? || updated.status == "completed"
          current = updated.participants.queue_providers.current.order(id: :desc).first
          token = current&.id&.to_s
          raise ActiveRecord::StaleObjectError.new(updated, "assign_provider") if expected_token != token
          profile = unless unassign
            practice.clinician_profiles.joins(:membership)
              .where(id: clinician_profile.id, clinic_memberships: { active: true }).first
          end
          raise ArgumentError, "The clinician is not active in this practice." if !unassign && !profile
          if profile && !profile.assignments.current.where(site_id: updated.site_id).exists?
            raise ArgumentError, "The clinician is not assigned to this encounter site."
          end
          current_profile_id = current&.membership&.clinician_profile&.id
          same_provider = profile && current_profile_id == profile.id
          current&.update!(effective_until: Time.current) unless same_provider
          participant = if unassign
            current
          elsif same_provider
            current
          else
            updated.participants.create!(practice: practice, patient: updated.patient, membership: profile.membership,
              participation_role: "queue_provider", effective_from: Time.current)
          end
          AuditRecorder.record!(practice: practice, actor: actor, action_code: "encounters.assign_provider",
            outcome: :committed, resource_version_ref: "encounter-participant:#{participant&.id}:#{participant&.updated_at&.utc&.iso8601(6)}")
          { participant: participant, token: unassign ? nil : participant&.id&.to_s, unassign: unassign }
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if result.receipt.outcome_outcome_unconfirmed?
        value = result.value
        return value.merge(token: nil) if value.is_a?(Hash) && value[:unassign]
        return value if value.is_a?(Hash)

        { participant: value, token: value&.id&.to_s }
      end
    end
  end
end
