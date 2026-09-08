module Clinic
  module Telehealth
    module Scribe
      module ScribeContext
        module_function

        def call(visit:, actor:)
          _membership, participant = Support.authorize_staff!(visit:, actor:)
          policy = Support.ensure_scribe_policy!(visit)
          snapshot = Support.consent_snapshot(visit)
          encounter = visit.scribe_encounter
          Support.ensure_exact_binding!(visit) if encounter
          recordings = Clinic::Scribe::Recording.where(practice_id: visit.practice_id,
            telehealth_visit_id: visit.id).order(:capture_epoch, :created_at, :id).to_a
          sources = Clinic::Scribe::Source.where(practice_id: visit.practice_id,
            telehealth_visit_id: visit.id, status: "ready").order(:capture_epoch, :source_order, :id).to_a
          source_by_recording = sources.index_by(&:telehealth_recording_id)
          owner_active = visit.scribe_capture_owner_participant_id.present? &&
            visit.scribe_capture_lease_expires_at.present? && visit.scribe_capture_lease_expires_at > Time.current

          allowed = []
          allowed << "request_scribe" unless encounter
          allowed << "record_own_consent" if encounter && participant
          allowed << "start_capture" if encounter && snapshot[:state] == "accepted" && !owner_active
          allowed << "renew_capture" if owner_active && visit.scribe_capture_owner_participant_id == participant.id
          allowed << "release_capture" if owner_active && visit.scribe_capture_owner_participant_id == participant.id
          if owner_active && visit.scribe_capture_owner_participant_id != participant.id &&
              Clinic::Authorization.allowed?(actor:, practice: visit.practice, action: "telehealth.host",
                site: visit.appointment.site)
            allowed << "take_over_capture"
          end
          allowed << "generate" if sources.any? && snapshot[:state] == "accepted"

          {
            visit_public_id: visit.public_id,
            visit_version: visit.lock_version,
            patient_id: visit.patient_id,
            clinical_encounter_id: visit.encounter_id,
            encounter_id: encounter&.id,
            encounter_version: encounter&.lock_version,
            context_content: encounter&.context_content,
            template_id: encounter&.template_id,
            recording_policy: {
              title: policy.scribe_consent_title,
              body: policy.scribe_consent_body
            },
            consent: {
              purpose: "scribe_recording",
              policy_version: policy.version,
              content_digest: policy.scribe_consent_digest,
              state: encounter ? snapshot[:state] : "not_requested",
              required_participants: snapshot[:rows].map do |row|
                subject = row[:participant]
                {
                  participant_id: subject.id,
                  role: subject.role,
                  display_name: subject.role.humanize,
                  status: row[:status]
                }
              end
            },
            capture: {
              owner_participant_id: owner_active ? visit.scribe_capture_owner_participant_id : nil,
              owner_display_name: owner_active ? visit.scribe_capture_owner_participant.role.humanize : nil,
              epoch: visit.scribe_capture_epoch,
              lease_expires_at: owner_active ? visit.scribe_capture_lease_expires_at&.iso8601(6) : nil
            },
            limits: Clinic::Scribe::RecordingCapture.limits,
            recordings: recordings.map do |recording|
              source = source_by_recording[recording.id]
              {
                id: recording.id,
                status: recording.status,
                source_id: source&.id,
                segment_index: source&.recording_segment_index || recording.recording_segment_index,
                source_order: source&.source_order || recording.source_order
              }
            end,
            sources: sources.map do |source|
              {
                id: source.id,
                recording_id: source.telehealth_recording_id,
                source_order: source.source_order,
                source_set_digest: source.source_set_digest
              }
            end,
            allowed_actions: allowed
          }
        end
      end
    end
  end
end
