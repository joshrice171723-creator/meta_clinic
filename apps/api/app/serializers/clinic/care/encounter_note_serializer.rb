require "digest"

module Clinic
  module Care
    module EncounterNoteSerializer
      def self.call(note, detail: false)
        latest = note.revisions.order(revision_no: :desc).first
        current_body = note.note_kind == "soap" && latest ? SoapNotePayload.load!(latest.encrypted_body) : nil
        has_signed_history = note.signatures.exists?
        payload = {
          id: note.id,
          patient_id: note.patient_id,
          encounter_id: note.encounter_id,
          note_kind: note.note_kind,
          version: note.lock_version,
          latest_revision: latest&.revision_no,
          current_revision_id: latest&.id,
          current_revision_signed: latest&.signatures&.exists? || false,
          current_template_id: current_body&.fetch(:template_id, nil),
          current_template_version: current_body&.fetch(:template_version, nil),
          signed: has_signed_history,
          has_signed_history: has_signed_history
        }
        return payload unless detail

        payload.merge(
          current_revision: revision(note, latest, body: current_body),
          revisions: note.revisions.chronological.includes(:signatures).map { |historical_revision|
            revision(note, historical_revision)
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

      def self.revision(note, revision, body: nil)
        return unless revision

        payload = {
          id: revision.id,
          revision_no: revision.revision_no,
          prior_revision_id: revision.prior_revision_id,
          author_membership_id: revision.author_membership_id,
          payload_version: revision.payload_version,
          created_at: revision.created_at&.iso8601(6),
          signed: revision.signatures.loaded? ? revision.signatures.any? : revision.signatures.exists?
        }
        return payload unless note.note_kind == "soap"

        payload.merge(body: body || SoapNotePayload.load!(revision.encrypted_body),
          content_digest: Digest::SHA256.hexdigest(revision.encrypted_body))
      end
    end
  end
end
