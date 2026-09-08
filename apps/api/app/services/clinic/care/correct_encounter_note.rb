module Clinic
  module Care
    class CorrectEncounterNote
      OPERATION_CODE = "notes.correct"

      def self.call(note:, actor:, encrypted_body:, corrected_revision_id:, expected_revision:, request_key:,
        payload_version: SoapNotePayload::CORRECTION_VERSION, required_template_id: nil)
        ensure_note_context!(note)
        raise ArgumentError, "Only SOAP notes support corrections." unless note.note_kind == "soap"
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
            corrected_revision_id: corrected_revision_id,
            expected_revision: expected_revision,
            payload_version: payload_version,
            required_template_id: required_template_id,
            encrypted_body: encrypted_body
          },
          resource: note,
          result_resource: ->(revision) { revision },
          resource_resolver: ->(practice:, receipt:) {
            Clinic::EncounterNoteRevision.find_by(
              id: receipt.resource_id,
              practice_id: practice.id,
              note_id: note.id
            )
          },
          authorization: -> {
            Authorization.authorize!(actor: actor, practice: note.practice, action: "notes.write", site: note.encounter.site)
          },
          authorization_action: "notes.write"
        ) do
          author_membership = active_author_membership!(note.practice, actor)

          note.with_lock do
            latest = note.revisions.order(revision_no: :desc).first
            unless latest && latest.id == corrected_revision_id.to_i && latest.revision_no == expected_revision.to_i
              raise ActiveRecord::StaleObjectError.new(note, "correction")
            end
            raise ArgumentError, "Only the current signed SOAP revision can be corrected." unless latest.signatures.exists?

            replacement = SoapNotePayload.load!(encrypted_body)
            correction = replacement.fetch(:correction) do
              raise ArgumentError, "A correction must preserve its signed revision provenance."
            end
            unless payload_version.to_i == SoapNotePayload::CORRECTION_VERSION &&
              correction.values_at(:corrected_revision_id, :corrected_revision_no) == [latest.id, latest.revision_no]
              raise ArgumentError, "A correction must identify the current signed revision."
            end

            SoapNotePayload.assert_same_template!(latest.encrypted_body, encrypted_body)
            if required_template_id.present? && replacement[:template_id] != required_template_id
              raise ArgumentError, "This correction source does not match the chart note template."
            end

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
        outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed note correction is unavailable.")
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
