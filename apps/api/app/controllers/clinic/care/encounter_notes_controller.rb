module Clinic
  module Care
    class EncounterNotesController < Clinic::ApiController
      before_action -> { require_capability("patients.read") }, only: :show
      before_action -> { require_capability("notes.write") }, only: %i[create revise sign]

      def show
        note = current_practice.encounter_notes.find(requested_id!(params[:id], :id))
        render json: { note: EncounterNoteSerializer.call(note, detail: true) }
      end

      def create
        input = parameter_hash!(:encounter_note, %i[encrypted_body payload_version])
        encounter = current_practice.encounters.find(requested_id!(params[:encounter_id], :encounter_id))
        note = Clinic::Care::CreateEncounterNote.call(
          practice: current_practice,
          actor: current_user,
          encounter: encounter,
          encrypted_body: required_string!(input[:encrypted_body], field: :encrypted_body, maximum: 100_000),
          payload_version: input[:payload_version].present? ? bounded_integer!(input[:payload_version], field: :payload_version, min: 1, max: 1_000_000) : 1
        )
        render json: { note: EncounterNoteSerializer.call(note, detail: true) }, status: :created
      end

      def revise
        input = parameter_hash!(:revision, %i[encrypted_body expected_revision payload_version])
        note = current_practice.encounter_notes.find(requested_id!(params[:id], :id))
        revision = Clinic::Care::ReviseEncounterNote.call(
          note: note,
          actor: current_user,
          encrypted_body: required_string!(input[:encrypted_body], field: :encrypted_body, maximum: 100_000),
          expected_revision: bounded_integer!(input[:expected_revision], field: :expected_revision, min: 1, max: 2_147_483_647),
          payload_version: input[:payload_version].present? ? bounded_integer!(input[:payload_version], field: :payload_version, min: 1, max: 1_000_000) : 1
        )
        render json: { revision: revision_json(revision) }, status: :created
      end

      def sign
        input = parameter_hash!(:signature, %i[revision_no content_digest attestation_version signed_at])
        note = current_practice.encounter_notes.find(requested_id!(params[:id], :id))
        signature = Clinic::Care::SignEncounterNote.call(
          note: note,
          actor: current_user,
          revision_no: bounded_integer!(input[:revision_no], field: :revision_no, min: 1, max: 2_147_483_647),
          content_digest: required_string!(input[:content_digest], field: :content_digest, maximum: 128),
          attestation_version: required_string!(input[:attestation_version], field: :attestation_version, maximum: 80),
          signed_at: input[:signed_at].present? ? time_param!(input[:signed_at], field: :signed_at) : Time.current
        )
        render json: { signature: signature_json(signature) }, status: :created
      end

      private

      def revision_json(revision)
        {
          id: revision.id,
          note_id: revision.note_id,
          revision_no: revision.revision_no,
          prior_revision_id: revision.prior_revision_id,
          author_membership_id: revision.author_membership_id,
          payload_version: revision.payload_version,
          created_at: revision.created_at
        }
      end

      def signature_json(signature)
        {
          id: signature.id,
          note_id: signature.note_id,
          revision_id: signature.revision_id,
          signer_membership_id: signature.signer_membership_id,
          content_digest: signature.content_digest,
          attestation_version: signature.attestation_version,
          signed_at: signature.signed_at&.iso8601(6)
        }
      end
    end
  end
end
