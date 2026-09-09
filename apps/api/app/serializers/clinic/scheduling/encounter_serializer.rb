module Clinic
  module Scheduling
    module EncounterSerializer
      def self.call(encounter, detail: false, actor: nil)
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

        payload.merge(
          participants: encounter.participants.order(:effective_from, :id).map { |participant|
            {
              id: participant.id.to_s,
              membership_id: participant.membership_id.to_s,
              participation_role: participant.participation_role,
              effective_from: participant.effective_from&.iso8601(6),
              effective_until: participant.effective_until&.iso8601(6)
            }
          },
          note_ids: encounter.notes.order(:id).pluck(:id),
          notes: Clinic::Care::EncounterNoteSerializer.collection(encounter.notes.order(:id)),
          observation_count: encounter.observations.count,
          document_count: encounter.documents.count
        )
      end
    end
  end
end
