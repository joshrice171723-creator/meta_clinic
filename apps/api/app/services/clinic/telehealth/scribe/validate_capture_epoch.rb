module Clinic
  module Telehealth
    module Scribe
      module ValidateCaptureEpoch
        module_function

        def call(visit:, actor:, capture_epoch:, owner_token:, recording: nil, require_owner: true)
          Support.ensure_exact_binding!(visit)
          snapshot = Support.consent_snapshot(visit)
          expected_version = Support.consent_epoch_version(visit, snapshot)
          unless snapshot[:state] == "accepted" && visit.scribe_encounter.consent_policy_version == expected_version
            raise Clinic::Telehealth::Error.new("Current participant consent does not allow Scribe capture or processing.",
              code: "scribe_consent_not_current", status: :conflict)
          end
          epoch = Integer(capture_epoch, exception: false)
          unless epoch&.positive? && epoch == visit.scribe_capture_epoch
            raise Clinic::Telehealth::Error.new("This Scribe capture epoch is stale.",
              code: "scribe_capture_stale", status: :conflict)
          end

          if require_owner
            _membership, participant = Support.authorize_staff!(visit:, actor:, action: "scribe.write")
            active = visit.scribe_capture_owner_participant_id == participant.id &&
              visit.scribe_capture_lease_expires_at.present? && visit.scribe_capture_lease_expires_at > Time.current &&
              Support.secure_token_match?(visit.scribe_capture_owner_token_digest, owner_token)
            unless active
              raise Clinic::Telehealth::Error.new("This browser no longer owns the Scribe capture lease.",
                code: "scribe_capture_not_owned", status: :conflict)
            end
          end

          if recording
            valid = recording.practice_id == visit.practice_id && recording.telehealth_visit_id == visit.id &&
              recording.encounter_id == visit.scribe_encounter_id && recording.capture_epoch == epoch
            unless valid
              raise Clinic::Telehealth::Error.new("The recording does not belong to this visit and capture epoch.",
                code: "scribe_recording_binding_mismatch", status: :conflict)
            end
          end
          visit
        end

        def processing!(visit:, actor:, recording:, capture_epoch:)
          Support.authorize_staff!(visit:, actor:, action: "scribe.write")
          call(visit:, actor:, capture_epoch:, owner_token: nil, require_owner: false)
          valid = recording.practice_id == visit.practice_id && recording.telehealth_visit_id == visit.id &&
            recording.encounter_id == visit.scribe_encounter_id && recording.capture_epoch.to_i.positive? &&
            recording.capture_epoch <= visit.scribe_capture_epoch
          unless valid
            raise Clinic::Telehealth::Error.new("The recording does not belong to this visit's acknowledged capture history.",
              code: "scribe_recording_binding_mismatch", status: :conflict)
          end
          unless recording.status == "completed"
            raise Clinic::Telehealth::Error.new("Only a completed acknowledged recording can be processed.",
              code: "scribe_recording_incomplete", status: :conflict)
          end
          visit
        end
      end
    end
  end
end
