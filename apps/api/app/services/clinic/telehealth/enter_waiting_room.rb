module Clinic
  module Telehealth
    module EnterWaitingRoom
      module_function

      def call(visit:, identity:, request_key:, expected_version:, consent: nil)
        payload = { expected_version: expected_version, consent: consent }
        outcome = PatientIdempotency.execute(identity: identity, visit: visit, operation_code: "telehealth.enter_waiting_room",
          request_key: request_key, payload: payload, result_kind: "participant") do
          visit.appointment.with_lock do
            visit.lock!
            raise ActiveRecord::StaleObjectError.new(visit, "update") unless visit.lock_version == expected_version.to_i
            if consent.present?
              value = consent.to_h.deep_symbolize_keys
              raise Error.new("The policy version changed. Review the current policy.", code: "stale_policy", status: :conflict) unless
                visit.policy_version.version == value[:policy_version].to_i
              raise Error.new("Acceptance is required to enter the waiting room.", code: "consent_required") unless value[:decision] == "accepted"
              participant = visit.participants.find_by!(portal_identity_id: identity.id)
              prior = visit.consents.where(participant_id: participant.id, purpose: "telehealth").order(sequence: :desc).first
              visit.consents.create!(practice_id: visit.practice_id, participant_id: participant.id,
                policy_version_id: visit.policy_version_id, purpose: "telehealth", decision: "accepted",
                sequence: prior&.sequence.to_i + 1, decided_at: Time.current, method: "portal_authenticated",
                policy_content_digest: visit.policy_version.content_digest, supersedes_consent_id: prior&.id)
            end
            preparation = CurrentPreparation.call(visit: visit)
            raise Error.new("Complete check-in and accept the current policy before waiting.", code: "preparation_incomplete") unless preparation[:complete]
            opens_at = visit.appointment.starts_at - visit.policy_version.join_early_minutes.minutes
            closes_at = visit.appointment.ends_at + visit.policy_version.join_late_minutes.minutes
            unless Time.current.between?(opens_at, closes_at)
              raise Error.new("The waiting room is not open.", code: "waiting_window_closed", status: :conflict)
            end
            participant = preparation.fetch(:participant)
            participant.update!(status: "waiting", last_seen_at: Time.current)
            participant
          end
        end
        outcome.value
      end
    end
  end
end
