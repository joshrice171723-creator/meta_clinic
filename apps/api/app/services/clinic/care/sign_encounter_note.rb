require "digest"

module Clinic
  module Care
    class SignEncounterNote
      def self.call(note:, actor:, revision_no:, content_digest:, attestation_version:, signed_at: Time.current)
        Authorization.authorize!(actor: actor, practice: note.practice, action: "notes.sign", site: note.encounter.site)
        signer_membership = note.practice.memberships.find_by!(user: actor)

        note.with_lock do
          revision = note.revisions.find_by!(revision_no: revision_no)
          expected_digest = Digest::SHA256.hexdigest(revision.encrypted_body)
          raise ArgumentError, "The note content changed. Reload and sign the current revision." unless content_digest == expected_digest

          note.signatures.create!(
            practice: note.practice,
            revision: revision,
            signer_membership: signer_membership,
            content_digest: expected_digest,
            attestation_version: attestation_version,
            signed_at: signed_at
          )
        end
      end
    end
  end
end
