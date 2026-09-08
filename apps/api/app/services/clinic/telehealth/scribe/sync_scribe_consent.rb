module Clinic
  module Telehealth
    module Scribe
      module SyncScribeConsent
        module_function

        def call(visit:, actor:)
          scribe = Support.ensure_exact_binding!(visit)
          policy = Support.ensure_scribe_policy!(visit)
          snapshot = Support.consent_snapshot(visit)
          version = Support.consent_epoch_version(visit, snapshot)
          changed = scribe.consent_policy_version != version
          accepted_at = snapshot[:rows].filter_map { |row| row[:consent]&.decided_at }.max

          if changed
            visit.update!(Support.clear_capture_attributes.merge(
              scribe_capture_epoch: visit.scribe_capture_epoch + 1
            ))
          end

          attributes = {
            consent_policy_version: version,
            consent_method: "telehealth_participant_set",
            consented_at: snapshot[:state] == "accepted" ? accepted_at : nil,
            consent_withdrawn_at: snapshot[:state] == "withdrawn" ? Time.current : nil
          }
          case snapshot[:state]
          when "accepted"
            attributes.merge!(consent_status: "accepted", status: "consented")
          when "withdrawn"
            attributes.merge!(consent_status: "withdrawn", status: "consent_withdrawn")
          when "declined"
            attributes.merge!(consent_status: "declined", status: "consent_declined")
          else
            attributes.merge!(consent_status: "not_recorded", status: "awaiting_consent")
          end
          scribe.update!(attributes)
          Clinic::Scribe::Event.create!(practice: visit.practice, encounter: scribe, actor:,
            event_type: "telehealth_consent_synced", resource_type: "Clinic::Telehealth::Visit",
            resource_id: visit.id, metadata: {
              policy_version_id: policy.id, participant_ids: snapshot[:participants].map(&:id),
              consent_set_digest: snapshot[:digest], consent_state: snapshot[:state],
              capture_epoch: visit.scribe_capture_epoch
            }, created_at: Time.current)
          snapshot
        end
      end
    end
  end
end
