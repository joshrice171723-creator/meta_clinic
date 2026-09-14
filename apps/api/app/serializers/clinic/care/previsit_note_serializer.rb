module Clinic
  module Care
    class PrevisitNoteSerializer
      def self.call(note)
        return unless note

        intake = PrevisitIntake.decode(note.encrypted_text)
        {
          id: note.id,
          version_number: note.version_number,
          text: note.text,
          additional_text: intake ? intake["text"] : note.text,
          intake_answers: intake ? intake["answers"] : {},
          status: intake&.fetch("status", "submitted") || "submitted",
          recorded_at: note.submitted_at.iso8601(6),
          author_id: note.submitted_by_user_id,
          source: "patient_reported",
          inherited_from: intake && intake["inherited_from"],
          form_id: intake && intake["form_id"],
          attestation: intake && intake["attestation"],
          submitted_at: note.submitted_at.iso8601(6)
        }
      end
    end
  end
end
