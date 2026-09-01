module Clinic
  module Care
    module EncounterNoteSerializer
      def self.call(note, detail: false)
        payload = {
          id: note.id,
          patient_id: note.patient_id,
          encounter_id: note.encounter_id,
          note_kind: note.note_kind,
          version: note.lock_version,
          latest_revision: note.revisions.maximum(:revision_no),
          signed: note.signatures.exists?
        }
        return payload unless detail

        latest = note.revisions.order(revision_no: :desc).first
        payload.merge(
          current_revision: current_revision(note, latest),
          revisions: note.revisions.chronological.includes(:signatures).map { |revision|
            {
              id: revision.id,
              revision_no: revision.revision_no,
              prior_revision_id: revision.prior_revision_id,
              author_membership_id: revision.author_membership_id,
              payload_version: revision.payload_version,
              created_at: revision.created_at,
              signed: revision.signatures.any?
            }
          },
          signatures: note.signatures.order(:signed_at, :id).map { |signature|
            {
              id: signature.id,
              revision_id: signature.revision_id,
              signer_membership_id: signature.signer_membership_id,
              content_digest: signature.content_digest,
              attestation_version: signature.attestation_version,
              signed_at: signature.signed_at&.iso8601(6)
            }
          }
        )
      end

      def self.current_revision(note, revision)
        return unless revision

        payload = {
          id: revision.id,
          revision_no: revision.revision_no,
          author_membership_id: revision.author_membership_id,
          payload_version: revision.payload_version,
          created_at: revision.created_at&.iso8601(6),
          signed: revision.signatures.exists?
        }
        return payload unless note.note_kind == "soap"

        payload.merge(body: SoapNotePayload.load!(revision.encrypted_body))
      end
    end
  end
end
