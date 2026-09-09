module Clinic
  module Telehealth
    module PatientVisitSerializer
      module_function

      def call(visit, identity:)
        participant = visit.participants.find { |value| value.portal_identity_id == identity.id }
        preparation = CurrentPreparation.call(visit: visit)
        connected_participant_ids = MediaPresence.call(visit)
        appointment = visit.appointment
        policy = visit.policy_version
        opens_at = appointment.starts_at - policy.join_early_minutes.minutes
        closes_at = appointment.ends_at + policy.join_late_minutes.minutes
        {
          public_id: visit.public_id, status: visit.status, access_generation: visit.access_generation,
          practice: { id: visit.practice_id, name: visit.practice.name, timezone: visit.practice.timezone },
          identity: { display_name: visit.patient.display_name },
          clinician: appointment.booked_clinician && { display_name: appointment.booked_clinician.display_name },
          appointment: VisitSerializer.appointment(appointment),
          encounter_id: visit.encounter_id,
          policy: VisitSerializer.policy(policy),
          support: { label: policy.support_label, phone: policy.support_phone, url: policy.support_url },
          window: { opens_at: opens_at.iso8601(6), closes_at: closes_at.iso8601(6),
            can_prepare: visit.scheduled? || visit.in_progress?, can_enter: Time.current.between?(opens_at, closes_at) },
          preparation: VisitSerializer.preparation_payload(preparation, include_sensitive: true),
          room: VisitSerializer.room_payload(visit.current_room_attempt),
          participants: visit.participants.map { |value| patient_participant(value, identity, connected_participant_ids: connected_participant_ids) },
          eligible_staff: [],
          scribe: VisitSerializer.scribe_payload(visit),
          completion: WrapUpSerializer.patient(visit),
          current_step: current_step(visit, participant, preparation),
          access_state: VisitSerializer.access_state(visit, participant: participant, preparation: preparation),
          updated_at: visit.updated_at.iso8601(6), allowed_actions: allowed_actions(visit, participant, preparation: preparation)
        }
      end

      def patient_participant(value, identity, connected_participant_ids: nil)
        payload = VisitSerializer.participant_payload(value, nil, connected_participant_ids: connected_participant_ids)
        payload[:is_current] = value.portal_identity_id == identity.id
        payload
      end

      def allowed_actions(visit, participant, preparation: nil)
        return [] unless participant && !visit.status.in?(%w[ended cancelled no_show])
        actions = %w[telehealth.submit_checkin telehealth.record_consent]
        preparation ||= CurrentPreparation.call(visit: visit)
        actions << "telehealth.enter_waiting_room" if preparation[:complete] && (visit.scheduled? || visit.in_progress?) &&
          !participant.revoked_at? && participant.status.in?(%w[eligible waiting left])
        actions << "telehealth.join" if participant.admitted? && visit.current_room_attempt&.status.in?(%w[ready active])
        actions << "telehealth.leave" unless participant.removed?
        actions << "telehealth.scribe_consent" if visit.policy_version.scribe_enabled?
        actions
      end

      def current_step(visit, participant, preparation)
        return "instructions" if visit.status.in?(%w[ended cancelled no_show])
        return "call" if participant&.admitted?
        return "waiting_room" if participant&.waiting?
        return "visit" if preparation[:reasons].intersect?(%w[
          checkin_required checkin_expired location_required location_attestation_required callback_required region_ineligible
        ])
        return "device_check" if preparation[:reasons].intersect?(%w[
          browser_unsupported microphone_unavailable speaker_unavailable camera_unavailable
        ])
        "consent"
      end
    end
  end
end
