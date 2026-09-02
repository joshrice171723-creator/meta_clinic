module Clinic
  module Care
    class EncounterNotesController < Clinic::ApiController
      # Reads and mutation services authorize the actual encounter site and action.

      rescue_from Clinic::Idempotency::OutcomeUnconfirmed do
        render json: {
          error: "The note operation outcome is unconfirmed. Look up the protected receipt before retrying.",
          code: "outcome_unconfirmed"
        }, status: :conflict
      end

      def index
        encounter = current_practice.encounters.find(requested_id!(params[:encounter_id], :encounter_id))
        authorize_note_read!(encounter)
        render json: {
          notes: encounter.notes.order(:id).map { |note| EncounterNoteSerializer.call(note) }
        }
      end

      def show
        note = current_practice.encounter_notes.find(requested_id!(params[:id], :id))
        authorize_note_read!(note.encounter)
        render json: { note: EncounterNoteSerializer.call(note, detail: true) }
      end

      def create
        input = parameter_hash!(:encounter_note,
          %i[note_kind template_id template_version subjective objective assessment plan request_key])
        encounter = current_practice.encounters.find(requested_id!(params[:encounter_id], :encounter_id))
        note_kind = enum_param!(input[:note_kind].presence || "soap", field: :note_kind, allowed: %w[soap])
        note = Clinic::Care::CreateEncounterNote.call(
          practice: current_practice,
          actor: current_user,
          encounter: encounter,
          note_kind: note_kind,
          encrypted_body: soap_payload(input),
          payload_version: SoapNotePayload::VERSION,
          request_key: request_key!(input[:request_key])
        )
        render json: { note: EncounterNoteSerializer.call(note, detail: true) }, status: :created
      end

      def revise
        input = parameter_hash!(:revision,
          %i[template_id template_version subjective objective assessment plan expected_revision request_key])
        note = current_practice.encounter_notes.find(requested_id!(params[:id], :id))
        raise ArgumentError, "Only SOAP drafts can be revised from this endpoint." unless note.note_kind == "soap"

        revision = Clinic::Care::ReviseEncounterNote.call(
          note: note,
          actor: current_user,
          encrypted_body: soap_payload(input),
          expected_revision: bounded_integer!(input[:expected_revision], field: :expected_revision, min: 1, max: 2_147_483_647),
          payload_version: SoapNotePayload::VERSION,
          request_key: request_key!(input[:request_key])
        )
        render json: {
          revision: revision_json(revision),
          note: EncounterNoteSerializer.call(note.reload, detail: true)
        }, status: :created
      end

      def sign
        input = parameter_hash!(:signature, %i[revision_no content_digest attestation_version])
        note = current_practice.encounter_notes.find(requested_id!(params[:id], :id))
        signature = Clinic::Care::SignEncounterNote.call(
          note: note,
          actor: current_user,
          revision_no: bounded_integer!(input[:revision_no], field: :revision_no, min: 1, max: 2_147_483_647),
          content_digest: required_string!(input[:content_digest], field: :content_digest, maximum: 128),
          attestation_version: required_string!(input[:attestation_version], field: :attestation_version, maximum: 80),
          signed_at: Time.current
        )
        render json: { signature: signature_json(signature) }, status: :created
      end

      private

      def authorize_note_read!(encounter)
        Clinic::Authorization.authorize!(actor: current_user, practice: current_practice,
          action: "notes.read", site: encounter.site)
      end

      def soap_payload(input)
        SoapNotePayload.dump(
          template_id: required_string!(input[:template_id], field: :template_id, maximum: 100),
          template_version: bounded_integer!(input[:template_version], field: :template_version, min: 1, max: 1_000_000),
          sections: %i[subjective objective assessment plan].to_h do |field|
            [ field, optional_string(input[field], field: field, maximum: SoapNotePayload::MAX_SECTION_LENGTH) || "" ]
          end
        )
      end

      def request_key!(value)
        key = required_string!(value, field: :request_key, maximum: 160)
        return key if key.match?(Clinic::Idempotency::KEY_PATTERN)

        raise Invalid.new("request_key must match the clinic idempotency key format.", field: :request_key)
      end

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
