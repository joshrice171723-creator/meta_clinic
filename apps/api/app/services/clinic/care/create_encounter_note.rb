module Clinic
  module Care
    class CreateEncounterNote
      OPERATION_CODE = "notes.create"

      def self.call(practice:, actor:, encounter:, encrypted_body:, request_key:, payload_version: 1, note_kind: "legacy")
        ensure_encounter_context!(practice, encounter)
        Authorization.authorize!(actor: actor, practice: practice, action: "notes.write", site: encounter.site)

        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: OPERATION_CODE,
          request_key: request_key,
          payload: {
            encounter_id: encounter.id,
            patient_id: encounter.patient_id,
            note_kind: note_kind,
            payload_version: payload_version,
            encrypted_body: encrypted_body
          },
          resource: encounter,
          result_resource: ->(note) { note },
          resource_resolver: ->(practice:, receipt:) {
            if receipt.resource_type == "Clinic::Encounter"
              next practice.encounters.find_by(
                id: receipt.resource_id,
                patient_id: encounter.patient_id
              )
            end

            practice.encounter_notes.find_by(
              id: receipt.resource_id,
              encounter_id: encounter.id,
              patient_id: encounter.patient_id
            )
          },
          authorization: -> {
            Authorization.authorize!(actor: actor, practice: practice, action: "notes.write", site: encounter.site)
          },
          authorization_action: "notes.write"
        ) do
          practice.lock! if note_kind == "soap"
          author_membership = active_author_membership!(practice, actor)
          if note_kind == "soap"
            body = SoapNotePayload.load!(encrypted_body)
            NoteTemplateCatalog.require_available!(practice:, encounter:,
              template_id: body.fetch(:template_id), template_version: body.fetch(:template_version))
          end
          note = encounter.notes.create!(practice: practice, patient: encounter.patient, note_kind: note_kind)
          revision = note.revisions.create!(
            practice: practice,
            revision_no: 1,
            author_membership: author_membership,
            encrypted_body: encrypted_body,
            payload_version: payload_version
          )
          Clinic::AuditRecorder.record!(
            practice: practice,
            actor: actor,
            action_code: OPERATION_CODE,
            outcome: :committed,
            resource_version_ref: "Clinic::EncounterNoteRevision/#{revision.id}"
          )
          note
        end

        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?
        value = if outcome.receipt.resource_type == "Clinic::Encounter"
          outcome.value&.notes&.find_by(note_kind: note_kind)
        else
          outcome.value
        end
        value || raise(Clinic::Idempotency::InvalidRequest, "The committed note is unavailable.")
      end

      def self.ensure_encounter_context!(practice, encounter)
        return if encounter.practice_id == practice.id && encounter.patient.practice_id == practice.id &&
          (!encounter.site || encounter.site.practice_id == practice.id)

        raise ArgumentError, "The encounter must belong to the selected practice."
      end
      private_class_method :ensure_encounter_context!

      def self.active_author_membership!(practice, actor)
        practice.memberships.active.find_by(user_id: actor.id) ||
          raise(Clinic::Idempotency::InvalidRequest, "An active clinic membership is required.")
      end
      private_class_method :active_author_membership!
    end
  end
end
