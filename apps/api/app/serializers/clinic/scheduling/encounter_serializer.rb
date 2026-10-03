module Clinic
  module Scheduling
    module EncounterSerializer
      def self.call(encounter, detail: false, actor: nil, include_note_metadata: false)
        payload = {
          id: encounter.id,
          patient_id: encounter.patient_id,
          appointment_id: encounter.appointment_id,
          site_id: encounter.site_id&.to_s,
          room_id: encounter.room_id,
          started_at: encounter.started_at&.iso8601(6),
          ended_at: encounter.ended_at&.iso8601(6),
          status: encounter.status,
          telehealth: Clinic::Scheduling::AppointmentSerializer.telehealth(encounter.telehealth_visit, actor: actor)
        }
        return payload unless detail

        payload = payload.merge(
          visit_modality: encounter.appointment&.visit_modality || "in_person",
          individual_therapy_visit: Clinic::Care::PsychotherapyNotes.therapy_visit?(encounter.practice, encounter, actor: actor),
          participants: encounter.participants.order(:effective_from, :id).map { |participant|
            {
              id: participant.id.to_s,
              membership_id: participant.membership_id.to_s,
              participation_role: participant.participation_role,
              effective_from: participant.effective_from&.iso8601(6),
              effective_until: participant.effective_until&.iso8601(6)
            }
          },
          observation_count: encounter.observations.count,
          document_count: encounter.documents.count
        )
        return payload.merge(note_ids: [], notes: [], note_metadata_redacted: true) unless include_note_metadata

        notes = encounter.notes.order(:id).to_a
        payload.merge(
          note_ids: notes.map(&:id),
          notes: Clinic::Care::EncounterNoteSerializer.collection(notes),
          note_metadata_redacted: false
        )
      end
    end
  end
end
