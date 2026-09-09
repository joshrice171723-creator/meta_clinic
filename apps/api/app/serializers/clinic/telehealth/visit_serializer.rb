module Clinic
  module Telehealth
    module VisitSerializer
      module_function

      def call(visit, actor:, include_preparation: false)
        membership = Clinic::Membership.active.find_by(practice_id: visit.practice_id, user_id: actor.id)
        participant = visit.participants.find { |value| value.membership_id == membership&.id }
        preparation = CurrentPreparation.call(visit: visit)
        connected_participant_ids = MediaPresence.call(visit)
        room = visit.current_room_attempt
        allowed, can_manage_wrap_up = staff_actions(visit, actor: actor, participant: participant)
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
          participants: visit.participants.map { |value| participant_payload(value, membership, connected_participant_ids: connected_participant_ids) },
          eligible_staff: eligible_staff(visit, actor: actor, allowed_actions: allowed),
          scribe: scribe_payload(visit),
          wrap_up: WrapUpWorkflow.can_read?(visit: visit, actor: actor) ? WrapUpSerializer.staff(visit.wrap_up) : nil,
          wrap_up_options: can_manage_wrap_up ? WrapUpWorkflow.options(visit) : nil,
          readiness: readiness(visit, preparation, connected_participant_ids: connected_participant_ids),
          waiting_since: visit.participants.select(&:patient?).filter_map { |value| value.status == "waiting" ? value.updated_at : nil }.min&.iso8601(6),
          connection: connection(visit, connected_participant_ids: connected_participant_ids),
          updated_at: visit.updated_at.iso8601(6),
          allowed_actions: allowed
        }
        payload
      end

      def queue_rows(visits, actor:)
        return [] if visits.empty?

        preparations = CurrentPreparation.queue_for(visits)
        presence = MediaPresence.for_visits(visits)
        history = MediaPresence.history_for_visits(visits)
        ability = Ability.new(actor, practice: visits.first.practice)
        visits.map do |visit|
          queue_row(visit, actor: actor, preparation: preparations.fetch(visit.id),
            connected_participant_ids: presence.fetch(visit.id),
            departed_participant_ids: history[:departed_participant_ids].fetch(visit.current_room_attempt_id, []),
            latest_event: history[:latest_events][visit.current_room_attempt_id], ability: ability)
        end
      end

      def queue_row(visit, actor:, preparation: nil, connected_participant_ids: nil, departed_participant_ids: nil,
        latest_event: nil, ability: nil)
        preparation ||= CurrentPreparation.call(visit: visit)
        connected_participant_ids ||= MediaPresence.call(visit)
        participant = actor_participant(visit, actor)
        allowed, = staff_actions(visit, actor: actor, participant: participant, ability: ability)
        {
          public_id: visit.public_id,
          status: visit.status,
          appointment: appointment(visit.appointment),
          readiness: readiness(visit, preparation, connected_participant_ids: connected_participant_ids,
            departed_participant_ids: departed_participant_ids),
          waiting_since: visit.participants.select(&:patient?).filter_map do |value|
            value.status == "waiting" ? value.updated_at : nil
          end.min&.iso8601(6),
          connection: connection(visit, connected_participant_ids: connected_participant_ids, latest_event: latest_event),
          encounter_id: visit.encounter_id,
          room: room_payload(visit.current_room_attempt),
          updated_at: visit.updated_at.iso8601(6),
          allowed_actions: allowed
        }
      end

      def actor_participant(visit, actor)
        visit.participants.find do |value|
          value.membership&.active? && value.membership.user_id == actor.id
        end
      end

      def staff_actions(visit, actor:, participant:, ability: nil)
        allowed = AccessPolicy.allowed_actions(actor_context: { actor: actor, practice: visit.practice }, visit: visit,
          participant: participant, ability: ability)
        allowed.delete("telehealth.save_wrap_up")
        can_manage_wrap_up = WrapUpWorkflow.can_manage?(visit: visit, actor: actor)
        if can_manage_wrap_up && !visit.wrap_up&.finalized?
          allowed << "telehealth.save_wrap_up"
          if WrapUpWorkflow.can_finalize?(visit: visit, actor: actor) &&
              WrapUpWorkflow.blockers(visit, visit.wrap_up).empty?
            allowed << "telehealth.finalize_wrap_up"
          end
        end
        [ allowed, can_manage_wrap_up ]
      end

      def appointment(value)
        {
          id: value.id, starts_at: value.starts_at.iso8601(6), ends_at: value.ends_at.iso8601(6),
          timezone: value.practice.timezone, site_id: value.site_id,
          clinician_membership_id: value.booked_clinician&.membership_id,
          clinician: value.booked_clinician && {
            membership_id: value.booked_clinician.membership_id,
            display_name: value.booked_clinician.display_name
          },
          visit_modality: value.visit_modality,
          patient: { id: value.patient_id, display_name: value.patient.display_name }
        }
      end

      def policy(value)
        {
          version: value.version, title: value.consent_title, body: value.consent_body,
          content_digest: value.content_digest, instructions: value.patient_instructions,
          allow_audio_only: value.allow_audio_only, allow_staff_screen_share: value.allow_staff_screen_share,
          require_location: value.require_location, require_callback: value.require_callback,
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

      def participant_payload(value, current_membership, connected_participant_ids: nil)
        display_name = if value.patient?
          value.visit.patient.display_name
        else
          value.membership&.clinician_profile&.display_name || "Clinic staff"
        end
        { id: value.id.to_s, role: value.role, status: value.status, is_current: value.membership_id == current_membership&.id,
          display_name: display_name, provider_subject_id: value.provider_subject_id,
          admitted_at: value.admitted_at&.iso8601(6),
          media_present: media_present?(value, connected_participant_ids: connected_participant_ids) }
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

      def media_present?(participant, connected_participant_ids: nil)
        (connected_participant_ids || MediaPresence.call(participant.visit)).include?(participant.id)
      end

      def participant_events(participant)
        ProviderEvent.where(practice_id: participant.practice_id, participant_id: participant.id,
          room_attempt_id: participant.visit.current_room_attempt_id)
      end

      def readiness(visit, preparation, connected_participant_ids: nil, departed_participant_ids: nil)
        return "ended" if visit.status.in?(%w[ended cancelled no_show])
        patient = preparation[:participant]
        return "connected" if patient && media_present?(patient, connected_participant_ids: connected_participant_ids)
        if patient
          departed = departed_participant_ids || participant_events(patient).where(event_type: "participant.left").pluck(:participant_id)
          return "disconnected" if departed.include?(patient.id)
        end
        return "admitted" if patient&.admitted?
        return "waiting" if patient&.waiting?
        return "preparation_needed" if preparation[:reasons].any? { |reason| reason != "telehealth_consent_required" }
        "consent_needed"
      end

      def connection(visit, connected_participant_ids: nil, latest_event: nil)
        return "ended" if visit.status.in?(%w[ended cancelled no_show])
        return "connected" if (connected_participant_ids || MediaPresence.call(visit)).any?
        latest = latest_event || visit.current_room_attempt&.provider_events&.order(occurred_at: :desc, id: :desc)&.first
        return "disconnected" if latest&.event_type.in?(%w[participant.left meeting.ended])
        "not_connected"
      end

      def access_state(visit, participant:, preparation: nil)
        return "ended" if visit.status.in?(%w[ended cancelled no_show])
        return "unavailable" unless participant
        return "rejoin" if participant.left? && visit.in_progress?
        return "join" if participant.admitted?
        return "waiting" if participant.waiting?
        prep = preparation || CurrentPreparation.call(visit: visit)
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
