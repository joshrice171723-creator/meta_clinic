module Clinic
  module Telehealth
    module RecordConsent
      module_function

      def call(visit:, identity:, request_key:, expected_version:, policy_version:, decision:, purpose: "telehealth")
        PatientIdempotency.validate_context!(identity, visit)
        decision = decision.to_s
        raise Error.new("The consent decision is invalid.", code: "invalid_consent", field: "decision") unless
          %w[accepted declined withdrawn].include?(decision)
        raise Error.new("The policy version changed. Review the current policy.", code: "stale_policy", status: :conflict) unless
          visit.policy_version.version == policy_version.to_i
        payload = { expected_version: expected_version, policy_version: policy_version, decision: decision, purpose: purpose }
        outcome = PatientIdempotency.execute(identity: identity, visit: visit, operation_code: "telehealth.record_#{purpose}_consent",
          request_key: request_key, payload: payload, result_kind: "consent") do
          visit.with_lock do
            raise ActiveRecord::StaleObjectError.new(visit, "update") unless visit.lock_version == expected_version.to_i
            participant = visit.participants.find_by!(portal_identity_id: identity.id)
            prior = visit.consents.where(participant_id: participant.id, purpose: purpose).order(sequence: :desc).first
            digest = purpose == "scribe_recording" ? visit.policy_version.scribe_consent_digest : visit.policy_version.content_digest
            raise Error.new("The requested consent policy is unavailable.", code: "policy_unavailable") if digest.blank?
            consent = visit.consents.create!(practice_id: visit.practice_id, participant_id: participant.id,
              policy_version_id: visit.policy_version_id, purpose: purpose, decision: decision,
              sequence: prior&.sequence.to_i + 1, decided_at: Time.current, method: "portal_authenticated",
              policy_content_digest: digest, supersedes_consent_id: prior&.id)
            invalidate_admission!(visit, participant, consent) if purpose == "telehealth" && decision != "accepted"
            consent
          end
        end
        outcome.value
      end

      def invalidate_admission!(visit, participant, consent)
        had_admission = participant.admitted? || participant.admitted_generation.present? ||
          participant.admitted_checkin_id.present?
        return visit.touch unless had_admission

        RevokeMembershipAccess.fence_capture!(visit) if visit.scribe_capture_owner_participant_id.present?
        participant.join_grants.where(access_generation: visit.access_generation, revoked_at: nil).find_each do |grant|
          grant.update!(revoked_at: Time.current, revocation_reason: "treatment_consent_#{consent.decision}")
        end
        participant.update!(status: "waiting", admitted_at: nil, admitted_by_membership_id: nil,
          admitted_generation: nil, admitted_checkin_id: nil)
        room = visit.current_room_attempt
        if room && !room.status.in?(%w[ended failed])
          visit.commands.find_or_create_by!(dedupe_key: "consent-eject:#{visit.access_generation}:#{participant.id}:#{consent.id}") do |command|
            command.practice_id = visit.practice_id
            command.room_attempt = room
            command.participant = participant
            command.kind = "eject_participant"
            command.access_generation = visit.access_generation
            command.status = "pending"
            command.available_at = Time.current
          end
        end
        visit.touch
      end
    end
  end
end
