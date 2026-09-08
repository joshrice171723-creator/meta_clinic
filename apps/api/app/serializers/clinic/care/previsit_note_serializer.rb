module Clinic
  module Care
    class PrevisitNoteSerializer
      def self.call(note)
        return unless note

        {
          id: note.id,
          version_number: note.version_number,
          text: note.text,
          submitted_at: note.submitted_at.iso8601(6)
        }
      end
    end
  end
end
