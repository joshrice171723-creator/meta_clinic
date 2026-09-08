module Clinic
  module PatientPortal
    module Telehealth
      class VisitsController < BaseController
        def show
          record_portal_read("telehealth.patient_visit.read")
          projection = Clinic::Telehealth::PatientVisitSerializer.call(patient_telehealth_visit,
            identity: patient_portal_identity)
          render json: envelope(projection, version: patient_telehealth_visit.lock_version,
            allowed_actions: projection[:allowed_actions])
        end

        def checkins
          input = params.permit(:request_key, :expected_version, checkin: [ :callback_phone, :location_attested,
            { location: %i[address_line1 unit city region_code postal_code country_code],
              device_results: %i[camera microphone speaker browser audio_only_requested checked_at] } ]).to_h.deep_symbolize_keys
          Clinic::Telehealth::SubmitCheckin.call(visit: patient_telehealth_visit, identity: patient_portal_identity,
            request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version), checkin: input.fetch(:checkin))
          render_patient_visit(status: :created)
        end

        def consents
          input = params.permit(:request_key, :expected_version, consent: %i[policy_version decision]).to_h.deep_symbolize_keys
          consent = input.fetch(:consent)
          Clinic::Telehealth::RecordConsent.call(visit: patient_telehealth_visit, identity: patient_portal_identity,
            request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version),
            policy_version: consent.fetch(:policy_version), decision: consent.fetch(:decision))
          render_patient_visit(status: :created)
        end

        def enter_waiting_room
          input = params.permit(:request_key, :expected_version, consent: %i[policy_version decision]).to_h.deep_symbolize_keys
          participant = Clinic::Telehealth::EnterWaitingRoom.call(visit: patient_telehealth_visit,
            identity: patient_portal_identity, request_key: input.fetch(:request_key),
            expected_version: input.fetch(:expected_version), consent: input[:consent])
          render_patient_visit(participant.visit)
        end

        def join_grant
          input = params.permit(:request_key, :expected_version).to_h.symbolize_keys
          participant = patient_telehealth_visit.participants.find_by!(portal_identity_id: patient_portal_identity.id)
          result = Clinic::Telehealth::IssueJoinGrant.call(visit: patient_telehealth_visit, participant: participant,
            identity: patient_portal_identity, request_key: input.fetch(:request_key),
            expected_version: input.fetch(:expected_version))
          response.headers["Cache-Control"] = "no-store"
          response.headers["Pragma"] = "no-cache"
          payload = { join_grant: { token: result.token, room_url: result.room_url, room_name: result.room_name,
            expires_at: result.grant.expires_at.iso8601(6), provider: result.provider,
            participant: { id: participant.id.to_s, provider_subject_id: participant.provider_subject_id },
            room: { expires_at: result.grant.room_attempt.expires_at.iso8601(6) } } }
          render json: envelope(payload, version: patient_telehealth_visit.lock_version, allowed_actions: [])
        end

        def leave
          input = params.permit(:request_key, :expected_version).to_h.symbolize_keys
          participant = patient_telehealth_visit.participants.find_by!(portal_identity_id: patient_portal_identity.id)
          Clinic::Telehealth::LeaveVisit.call(visit: patient_telehealth_visit, participant: participant,
            identity: patient_portal_identity, request_key: input.fetch(:request_key),
            expected_version: input.fetch(:expected_version))
          render_patient_visit
        end
      end
    end
  end
end
