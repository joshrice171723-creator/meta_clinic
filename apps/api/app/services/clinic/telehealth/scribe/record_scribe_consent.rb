module Clinic
  module Telehealth
    module Scribe
      module RecordScribeConsent
        module_function

        def call(visit:, actor:, decision:, request_key:, expected_version:, portal_identity: nil)
          policy = Support.ensure_scribe_policy!(visit)
          decision = decision.to_s
          unless %w[accepted declined withdrawn].include?(decision)
            raise Clinic::Telehealth::Error.new("The Scribe consent decision is not supported.",
              code: "invalid_scribe_consent", status: :unprocessable_entity)
          end
          participant, method = if portal_identity
            valid = portal_identity.active? && portal_identity.practice_id == visit.practice_id &&
              portal_identity.patient_id == visit.patient_id
            raise Clinic::Authorization::Denied unless valid
            [ visit.participants.active_record.find_by!(portal_identity_id: portal_identity.id), "portal_authenticated" ]
          else
            _membership, staff_participant = Support.authorize_staff!(visit:, actor:, action: "scribe.write")
            [ staff_participant, "staff_authenticated" ]
          end

          operation = -> do
            visit.lock!
            Support.verify_expected_version!(visit, expected_version)
            unless visit.scribe_encounter
              if portal_identity
                raise Clinic::Telehealth::Error.new("Scribe has not been requested for this visit.",
                  code: "scribe_not_requested", status: :conflict)
              end
              BindScribeEncounter.call(visit:, actor:)
            end
            prior = visit.consents.scribe_recording.where(participant_id: participant.id)
              .order(sequence: :desc, id: :desc).first
            consent = visit.consents.create!(practice: visit.practice, participant:, policy_version: policy,
              purpose: "scribe_recording", decision:, sequence: prior ? prior.sequence + 1 : 1,
              decided_at: Time.current, method:, policy_content_digest: policy.scribe_consent_digest,
              supersedes_consent: prior)
            SyncScribeConsent.call(visit:, actor:)
            Support.record_audit!(visit:, actor:, action: "consent_#{decision}")
            consent
          end

          if portal_identity
            outcome = Clinic::Telehealth::PatientIdempotency.execute(identity: portal_identity, visit:,
              operation_code: "telehealth.scribe.consent", request_key:,
              payload: { decision:, expected_version: Integer(expected_version, exception: false) },
              result_kind: "consent", &operation)
          else
            outcome = Clinic::Idempotency.execute(practice: visit.practice, actor:,
              operation_code: "telehealth.scribe.consent", request_key:,
              payload: { visit_id: visit.id, participant_id: participant.id, decision:,
                expected_version: Integer(expected_version, exception: false) }, resource: visit,
              authorization_action: "telehealth.scribe.consent",
              result_resource: ->(value) { value },
              resource_resolver: ->(practice:, receipt:) {
                Clinic::Telehealth::Consent.find_by(practice_id: practice.id, id: receipt.resource_id)
              }, &operation)
          end
          outcome.value
        end
      end
    end
  end
end
