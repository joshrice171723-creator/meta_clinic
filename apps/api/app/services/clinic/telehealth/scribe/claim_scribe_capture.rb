module Clinic
  module Telehealth
    module Scribe
      module ClaimScribeCapture
        Result = Data.define(:visit, :owner_token)
        module_function

        def call(visit:, actor:, request_key:, expected_version:, expected_capture_epoch:)
          _membership, participant = Support.authorize_staff!(visit:, actor:, action: "scribe.write")
          payload = { visit_id: visit.id, expected_version: Integer(expected_version, exception: false),
            expected_capture_epoch: Integer(expected_capture_epoch, exception: false), participant_id: participant.id }
          outcome = Clinic::Idempotency.execute(practice: visit.practice, actor:,
            operation_code: "telehealth.scribe.claim", request_key:, payload:, resource: visit,
            authorization_action: "telehealth.scribe.claim",
            result_resource: ->(value) { value },
            resource_resolver: ->(practice:, receipt:) {
              Clinic::Telehealth::Visit.find_by(practice_id: practice.id, id: receipt.resource_id)
            }) do
            visit.lock!
            Support.verify_expected_version!(visit, expected_version)
            BindScribeEncounter.call(visit:, actor:) unless visit.scribe_encounter
            snapshot = SyncScribeConsent.call(visit:, actor:)
            unless snapshot[:state] == "accepted"
              raise Clinic::Telehealth::Error.new("Every active participant must allow Scribe before capture starts.",
                code: "scribe_consent_required", status: :conflict)
            end
            expected_epoch = Integer(expected_capture_epoch, exception: false)
            unless expected_epoch == visit.scribe_capture_epoch
              raise ActiveRecord::StaleObjectError.new(visit, "claim")
            end
            if visit.scribe_capture_owner_participant_id.present? &&
                visit.scribe_capture_lease_expires_at.present? && visit.scribe_capture_lease_expires_at > Time.current
              raise Clinic::Telehealth::Error.new("Another browser currently owns Scribe recording.",
                code: "scribe_capture_owned", status: :conflict)
            end
            Clinic::Scribe::Recording.where(practice_id: visit.practice_id,
              telehealth_visit_id: visit.id, status: %w[recording interrupted]).find_each do |recording|
              Clinic::Scribe::RecordingCapture.reconcile_interrupted!(recording:, actor:)
            end
            epoch = visit.scribe_capture_epoch + 1
            token = Support.owner_token(visit:, participant:, epoch:, request_key:)
            visit.update!(scribe_capture_owner_participant: participant,
              scribe_capture_owner_token_digest: Support.token_digest(token),
              scribe_capture_epoch: epoch, scribe_capture_lease_expires_at: Time.current + Support::LEASE_DURATION)
            Support.record_audit!(visit:, actor:, action: "capture_claimed")
            visit
          end
          current = outcome.value || visit.reload
          token = Support.owner_token(visit: current, participant:, epoch: current.scribe_capture_epoch, request_key:)
          unless Support.secure_token_match?(current.scribe_capture_owner_token_digest, token)
            raise Clinic::Telehealth::Error.new("The prior capture claim is no longer current. Reload before taking over.",
              code: "scribe_capture_stale", status: :conflict)
          end
          Result.new(visit: current, owner_token: token)
        end
      end
    end
  end
end
