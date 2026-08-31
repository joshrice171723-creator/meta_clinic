module Clinic
  module Care
    class CreateEncounterNote
      def self.call(practice:, actor:, encounter:, encrypted_body:, payload_version: 1)
        Authorization.authorize!(actor: actor, practice: practice, action: "notes.write", site: encounter.site)
        author_membership = practice.memberships.find_by!(user: actor)
        raise ArgumentError, "The encounter must belong to the selected practice." unless encounter.practice_id == practice.id

        ApplicationRecord.transaction do
          note = encounter.notes.create!(practice: practice, patient: encounter.patient)
          note.revisions.create!(
            practice: practice,
            revision_no: 1,
            author_membership: author_membership,
            encrypted_body: encrypted_body,
            payload_version: payload_version
          )
          note
        end
      end
    end
  end
end
