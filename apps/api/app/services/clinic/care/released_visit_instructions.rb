module Clinic
  module Care
    class ReleasedVisitInstructions
      def self.items(practice:, patient:, encounter: nil)
        notes = Clinic::EncounterNote.where(
          practice: practice, patient: patient, note_kind: "soap"
        ).joins(:encounter).where(
          clinic_encounters: { status: "completed" }
        ).where.not(
          clinic_encounters: { ended_at: nil }
        ).includes(:encounter, revisions: :signatures)
        notes = notes.where(encounter: encounter) if encounter

        notes.filter_map do |note|
          revision = note.revisions.select { |candidate| candidate.signatures.any? }.max_by(&:revision_no)
          next unless revision

          instructions = Clinic::Care::SoapNotePayload.load!(revision.encrypted_body)[:patient_instructions]
          next if instructions.blank?

          signature = revision.signatures.max_by { |candidate| [ candidate.signed_at, candidate.id ] }
          {
            encounter_id: note.encounter_id,
            visit_at: note.encounter.started_at&.iso8601(6),
            signed_at: signature.signed_at.iso8601(6),
            instructions: instructions
          }
        end.sort_by { |item| [ item.fetch(:visit_at), item.fetch(:encounter_id) ] }.reverse
      end

      def self.handout(practice:, patient:, encounter:)
        item = items(practice: practice, patient: patient, encounter: encounter).first
        item&.merge(patient_name: patient.display_name, practice_name: practice.name, timezone: practice.timezone)
      end
    end
  end
end
