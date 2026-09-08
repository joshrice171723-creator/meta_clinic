module Clinic
  module PatientPortal
    module Telehealth
      class ScribeController < BaseController
        def consent
          input = telehealth_input(:consent, %i[decision request_key expected_version])
          visit = patient_telehealth_visit
          Clinic::Telehealth::Scribe::RecordScribeConsent.call(visit:, actor: current_user,
            portal_identity: patient_portal_identity, decision: input.fetch(:decision),
            request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version))
          snapshot = Clinic::Telehealth::Scribe::Support.consent_snapshot(visit.reload)
          policy = visit.policy_version
          data = {
            scribe: {
              visit_public_id: visit.public_id,
              visit_version: visit.lock_version,
              consent: {
                purpose: "scribe_recording",
                state: snapshot[:state],
                policy_version: policy.version,
                content_digest: policy.scribe_consent_digest,
                title: policy.scribe_consent_title,
                body: policy.scribe_consent_body
              },
              recording_active: visit.scribe_capture_owner_participant_id.present? &&
                visit.scribe_capture_lease_expires_at.present? && visit.scribe_capture_lease_expires_at > Time.current
            }
          }
          render_telehealth(data:, visit:, status: :created, allowed_actions: [])
        end
      end
    end
  end
end
