module Clinic
  module Telehealth
    module VisitSerializer
      module_function

      def call(visit, actor:, include_preparation: false)
        membership = Clinic::Membership.active.find_by(practice_id: visit.practice_id, user_id: actor.id)
        participant = visit.participants.find { |value| value.membership_id == membership&.id }
        preparation = CurrentPreparation.call(visit: visit)
        room = visit.current_room_attempt
        allowed = AccessPolicy.allowed_actions(actor_context: { actor: actor, practice: visit.practice }, visit: visit,
          participant: participant)
        can_read_preparation = Ability.new(actor, practice: visit.practice)
          .allowed_permission?("telehealth.prepare.read", site: visit.appointment.site)
        payload = {
          public_id: visit.public_id,
          status: visit.status,
          access_generation: visit.access_generation,
          appointment: appointment(visit.appointment),
          encounter_id: visit.encounter_id,
          policy: policy(visit.policy_version),
          preparation: preparation_payload(preparation, include_sensitive: include_preparation && can_read_preparation),
          room: room_payload(room),
          participants: visit.participants.map { |value| participant_payload(value, membership) },
          eligible_staff: eligible_staff(visit, actor: actor, allowed_actions: allowed),
          scribe: scribe_payload(visit),
          readiness: readiness(visit, preparation),
          waiting_since: visit.participants.select(&:patient?).filter_map { |value| value.status == "waiting" ? value.updated_at : nil }.min&.iso8601(6),
          connection: connection(visit),
          updated_at: visit.updated_at.iso8601(6),
          allowed_actions: allowed
        }
        payload
      end

      def queue_row(visit, actor:)
        detail = call(visit, actor: actor, include_preparation: false)
        detail.slice(:public_id, :status, :appointment, :readiness, :waiting_since, :connection, :encounter_id,
          :room, :updated_at, :allowed_actions)
      end

      def appointment(value)
        {
          id: value.id, starts_at: value.starts_at.iso8601(6), ends_at: value.ends_at.iso8601(6),
          timezone: value.practice.timezone, site_id: value.site_id,
          clinician_membership_id: value.booked_clinician&.membership_id,
          visit_modality: value.visit_modality,
          patient: { id: value.patient_id, display_name: value.patient.display_name }
        }
      end

      def policy(value)
        {
          version: value.version, title: value.consent_title, body: value.consent_body,
          content_digest: value.content_digest, instructions: value.patient_instructions,
          allow_audio_only: value.allow_audio_only, allow_staff_screen_share: value.allow_staff_screen_share,
          scribe_enabled: value.scribe_enabled, scribe_consent_title: value.scribe_consent_title,
          scribe_consent_body: value.scribe_consent_body
        }
      end

      def preparation_payload(value, include_sensitive:)
        payload = { checkin_id: value[:checkin]&.id, complete: value[:complete], verified: value[:verified], reasons: value[:reasons],
          device_results: value[:checkin]&.device_results }
        if include_sensitive
          payload[:location] = value[:checkin]&.location
          payload[:callback_phone] = value[:checkin]&.callback_phone
        end
        payload
      end

      def room_payload(room)
        return { status: "not_prepared", expires_at: nil, started_at: nil, ended_at: nil } unless room
        { status: room.status, expires_at: room.expires_at&.iso8601(6), started_at: room.started_at&.iso8601(6),
          ended_at: room.ended_at&.iso8601(6) }
      end

      def participant_payload(value, current_membership)
        display_name = if value.patient?
          value.visit.patient.display_name
        else
          value.membership&.clinician_profile&.display_name || "Clinic staff"
        end
        { id: value.id.to_s, role: value.role, status: value.status, is_current: value.membership_id == current_membership&.id,
          display_name: display_name, provider_subject_id: value.provider_subject_id,
          admitted_at: value.admitted_at&.iso8601(6),
          media_present: media_present?(value) }
      end

      def eligible_staff(visit, actor:, allowed_actions:)
        return [] unless allowed_actions.include?("telehealth.add_participant")

        existing_ids = visit.participants.filter_map(&:membership_id)
        memberships = Clinic::Membership.active.includes(:user, :clinician_profile)
          .where(practice_id: visit.practice_id).where.not(id: existing_ids).order(:id).to_a
        staff_names = Clinic::Workforce::Employment.where(practice_id: visit.practice_id,
          membership_id: memberships.map(&:id)).includes(:staff_member).index_by(&:membership_id)
        memberships.filter_map do |candidate|
          next unless candidate.user.active?
          next unless Ability.new(candidate.user, practice: visit.practice)
            .allowed_permission?("telehealth.participate", site: visit.appointment.site)

          {
            membership_id: candidate.id,
            display_name: candidate.clinician_profile&.display_name.presence ||
              staff_names[candidate.id]&.staff_member&.display_name.presence || "Clinic staff",
            role: candidate.clinician_profile ? "clinician" : "assistant"
          }
        end
      end

      def media_present?(participant)
        event = ProviderEvent.where(practice_id: participant.practice_id, participant_id: participant.id).order(occurred_at: :desc).first
        event&.event_type == "participant.joined"
      end

      def readiness(visit, preparation)
        return "ended" if visit.status.in?(%w[ended cancelled no_show])
        patient = preparation[:participant]
        return "connected" if patient && media_present?(patient)
        return "disconnected" if patient && ProviderEvent.where(participant_id: patient.id, event_type: "participant.left").exists?
        return "admitted" if patient&.admitted?
        return "waiting" if patient&.waiting?
        return "preparation_needed" if preparation[:reasons].any? { |reason| reason != "telehealth_consent_required" }
        "consent_needed"
      end

      def connection(visit)
        return "ended" if visit.status.in?(%w[ended cancelled no_show])
        latest = visit.current_room_attempt&.provider_events&.order(occurred_at: :desc)&.first
        return "connected" if latest&.event_type == "participant.joined"
        return "disconnected" if latest&.event_type.in?(%w[participant.left meeting.ended])
        "not_connected"
      end

      def access_state(visit, participant:)
        return "ended" if visit.status.in?(%w[ended cancelled no_show])
        return "unavailable" unless participant
        return "rejoin" if participant.left? && visit.in_progress?
        return "join" if participant.admitted?
        return "waiting" if participant.waiting?
        prep = CurrentPreparation.call(visit: visit)
        prep[:checkin] ? "continue_preparation" : "prepare"
      end

      def scribe_payload(visit)
        consent = visit.consents.where(purpose: "scribe_recording").order(sequence: :desc).first
        { encounter_id: visit.scribe_encounter_id, consent_state: consent&.decision || "not_requested",
          capture: { owner_participant_id: visit.scribe_capture_owner_participant_id,
            epoch: visit.scribe_capture_epoch, lease_expires_at: visit.scribe_capture_lease_expires_at&.iso8601(6) } }
      end
    end
  end
end
