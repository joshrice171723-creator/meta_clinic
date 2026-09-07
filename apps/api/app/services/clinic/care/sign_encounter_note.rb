require "digest"

module Clinic
  module Care
    class SignEncounterNote
      def self.call(note:, actor:, revision_no:, content_digest:, attestation_version:, signed_at: Current.business_time)
        Authorization.authorize!(actor: actor, practice: note.practice, action: "notes.sign", site: note.encounter.site)
        signer_membership = note.practice.memberships.find_by!(user: actor)

        note.with_lock do
          revision = note.revisions.order(revision_no: :desc).first!
          raise ArgumentError, "Reload and sign the current revision." unless revision.revision_no == revision_no.to_i
          expected_digest = Digest::SHA256.hexdigest(revision.encrypted_body)
          raise ArgumentError, "The note content changed. Reload and sign the current revision." unless content_digest == expected_digest

          existing = note.signatures.find_by(revision: revision, signer_membership: signer_membership)
          if existing
            unless existing.content_digest == expected_digest && existing.attestation_version == attestation_version
              raise ArgumentError, "This revision was already signed with a different attestation. Reload the note."
            end
            return existing
          end

          signature = note.signatures.create!(
            practice: note.practice,
            revision: revision,
            signer_membership: signer_membership,
            content_digest: expected_digest,
            attestation_version: attestation_version,
            signed_at: signed_at
          )
          Clinic::AuditRecorder.record!(practice: note.practice, actor: actor,
            action_code: "notes.sign", outcome: :committed,
            resource_version_ref: "Clinic::EncounterNoteSignature/#{signature.id}")
          signature
        end
      end
    end
  end
end
