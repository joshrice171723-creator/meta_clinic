module Clinic
  module Care
    class ReviseEncounterNote
      OPERATION_CODE = "notes.revise"

      def self.call(note:, actor:, encrypted_body:, expected_revision:, request_key:, payload_version: 1)
        ensure_note_context!(note)
        Authorization.authorize!(actor: actor, practice: note.practice, action: "notes.write", site: note.encounter.site)

        outcome = Clinic::Idempotency.execute(
          practice: note.practice,
          actor: actor,
          operation_code: OPERATION_CODE,
          request_key: request_key,
          payload: {
            note_id: note.id,
            patient_id: note.patient_id,
            encounter_id: note.encounter_id,
            expected_revision: expected_revision,
            payload_version: payload_version,
            encrypted_body: encrypted_body
          },
          resource: note,
          authorization: -> {
            Authorization.authorize!(actor: actor, practice: note.practice, action: "notes.write", site: note.encounter.site)
          },
          authorization_action: "notes.write"
        ) do
          author_membership = active_author_membership!(note.practice, actor)

          note.with_lock do
            latest = note.revisions.order(revision_no: :desc).first
            unless latest && latest.revision_no == expected_revision.to_i
              raise ActiveRecord::StaleObjectError.new(note, "revision")
            end
            if latest.signatures.exists?
              raise ArgumentError, "Signed note content is immutable; append a new correction revision."
            end
            SoapNotePayload.assert_same_template!(latest.encrypted_body, encrypted_body) if note.note_kind == "soap"

            revision = note.revisions.create!(
              practice: note.practice,
              revision_no: latest.revision_no + 1,
              prior_revision: latest,
              author_membership: author_membership,
              encrypted_body: encrypted_body,
              payload_version: payload_version
            )
            Clinic::AuditRecorder.record!(
              practice: note.practice,
              actor: actor,
              action_code: OPERATION_CODE,
              outcome: :committed,
              resource_version_ref: "Clinic::EncounterNoteRevision/#{revision.id}"
            )
            revision
          end
        end

        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?
        return outcome.value unless outcome.replayed

        note.revisions.find_by!(revision_no: expected_revision.to_i + 1)
      end

      def self.ensure_note_context!(note)
        encounter = note.encounter
        return if note.practice_id == encounter.practice_id && note.patient_id == encounter.patient_id &&
          (!encounter.site || encounter.site.practice_id == note.practice_id)

        raise ArgumentError, "The note must belong to its encounter and practice."
      end
      private_class_method :ensure_note_context!

      def self.active_author_membership!(practice, actor)
        practice.memberships.active.find_by(user_id: actor.id) ||
          raise(Clinic::Idempotency::InvalidRequest, "An active clinic membership is required.")
      end
      private_class_method :active_author_membership!
    end
  end
end
