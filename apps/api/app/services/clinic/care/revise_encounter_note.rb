module Clinic
  module Care
    class ReviseEncounterNote
      def self.call(note:, actor:, encrypted_body:, expected_revision:, payload_version: 1)
        Authorization.authorize!(actor: actor, practice: note.practice, action: "notes.write", site: note.encounter.site)
        author_membership = note.practice.memberships.find_by!(user: actor)

        note.with_lock do
          latest = note.revisions.order(revision_no: :desc).first
          unless latest && latest.revision_no == expected_revision.to_i
            raise ActiveRecord::StaleObjectError.new(note, "revision")
          end
          if latest.signatures.exists?
            raise ArgumentError, "Signed note content is immutable; append a new correction revision."
          end
          SoapNotePayload.assert_same_template!(latest.encrypted_body, encrypted_body) if note.note_kind == "soap"

          note.revisions.create!(
            practice: note.practice,
            revision_no: latest.revision_no + 1,
            prior_revision: latest,
            author_membership: author_membership,
            encrypted_body: encrypted_body,
            payload_version: payload_version
          )
        end
      end
    end
  end
end
