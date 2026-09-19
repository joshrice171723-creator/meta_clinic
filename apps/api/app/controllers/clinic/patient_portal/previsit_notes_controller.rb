module Clinic
  module PatientPortal
    class PrevisitNotesController < BaseController
      rescue_from Clinic::PatientPortal::PrevisitNotes::Conflict do |error|
        render json: { error: error.message, code: "request_conflict" }, status: :conflict
      end
      rescue_from Clinic::PatientPortal::PrevisitNotes::Stale do |error|
        render json: { error: error.message, code: "stale_record" }, status: :conflict
      end
      rescue_from Clinic::PatientPortal::PrevisitNotes::Ineligible do |error|
        render json: { error: error.message, code: "appointment_ineligible" }, status: :unprocessable_entity
      end
      rescue_from Clinic::Authorization::Denied do
        render json: { error: "This patient portal account cannot edit that appointment." }, status: :forbidden
      end

      def show
        appointment = portal_appointment!
        note = PrevisitNotes.latest(appointment)
        record_portal_read("patient_portal.previsit_note.read")
        render json: projection(appointment, note)
      end

      def create
        appointment = portal_appointment!
        input = parameter_hash!(:previsit_note, %i[text intake_answers attestation status reused_note_id expected_version request_key form_id])
        unless input.key?(:text)
          raise Clinic::Api::RequestParameters::Invalid.new("text is required.", field: :text)
        end
        text = optional_string(
          input[:text], field: :text, maximum: Clinic::Care::PrevisitNote::MAX_TEXT_LENGTH
        ) || ""
        raise ArgumentError, "Send structured intake through the intake answers fields." if text.start_with?(Clinic::Care::PrevisitIntake::PREFIX)
        if params[:previsit_note].key?(:intake_answers) || input.key?(:status)
          latest = PrevisitNotes.latest(appointment)
          form = Clinic::Care::PrevisitIntake.form_for(practice: portal_practice, appointment: appointment,
            payload: latest && Clinic::Care::PrevisitIntake.decode(latest.encrypted_text))
          if input[:form_id].present? && input[:form_id] != form[:id]
            raise ArgumentError, "The form revision changed. Reopen this intake before saving; other patient work remains available."
          end
          answers = params[:previsit_note][:intake_answers] || {}
          answers = answers.to_unsafe_h if answers.is_a?(ActionController::Parameters)
          text = Clinic::Care::PrevisitIntake.encode(
            text: text,
            form_id: form[:id],
            answers: answers,
            attested: input[:attestation],
            status: input[:status] || "submitted",
            inherited_from: inherited_source(input[:reused_note_id], answers)
          )
        end
        Clinic::Care::PrevisitIntake.validate_medication_references!(text, practice: portal_practice)
        result = PrevisitNotes.submit(
          practice: portal_practice,
          patient: portal_patient,
          appointment: appointment,
          actor: current_user,
          identity: patient_portal_identity,
          omni_preview: development_omni_preview?,
          text: text,
          expected_version: bounded_integer!(
            input[:expected_version], field: :expected_version, min: 0, max: 2_147_483_647
          ),
          request_key: request_key!(input[:request_key])
        )
        render json: projection(appointment, result.note), status: result.replayed ? :ok : :created
      end

      private

      def inherited_source(note_id, answers)
        return if note_id.blank?
        note = Clinic::Care::PrevisitNote.where(practice_id: portal_practice.id, patient_id: portal_patient.id)
          .find(integer_id!(note_id, field: :reused_note_id))
        intake = Clinic::Care::PrevisitIntake.decode(note.encrypted_text)
        raise ArgumentError, "Only submitted intake can supply previous answers." unless intake && intake["status"] != "draft"
        fields = Clinic::Care::PrevisitIntake::FIELDS.select do |field|
          field[:reusable] && answers.is_a?(Hash) && answers[field[:id]] == intake["answers"][field[:id]]
        end.map { |field| field[:id] }
        { note_id: note.id, version: note.version_number, author_id: note.submitted_by_user_id,
          recorded_at: note.submitted_at.iso8601(6), question_ids: fields }
      end

      def portal_appointment!
        portal_patient.appointments.find(integer_id!(params[:appointment_id], field: :appointment_id))
      end

      def projection(appointment, note)
        prior_notes = Clinic::Care::PrevisitNote.where(
          practice_id: portal_practice.id, patient_id: portal_patient.id
        ).where.not(appointment_id: appointment.id)
          .where("submitted_at <= ?", Current.business_time)
          .order(submitted_at: :desc, id: :desc).limit(25)
        reusable = prior_notes.lazy.map do |candidate|
          [ candidate, Clinic::Care::PrevisitIntake.decode(candidate.encrypted_text) ]
        end.find { |_candidate, intake| intake.present? && intake["status"] != "draft" }
        previous, previous_intake = reusable
        form = Clinic::Care::PrevisitIntake.form_for(practice: portal_practice, appointment: appointment,
          payload: note && Clinic::Care::PrevisitIntake.decode(note.encrypted_text))
        {
          appointment_id: appointment.id,
          note: Clinic::Care::PrevisitNoteSerializer.call(note),
          intake_form: {
            **form,
            max_answer_length: Clinic::Care::PrevisitIntake::MAX_ANSWER_LENGTH,
            answer_states: Clinic::Care::PrevisitIntake::ANSWER_STATES,
            medication_options: Clinic::Care::PrevisitIntake.medication_options(portal_practice),
            medication_references: Clinic::Care::PrevisitIntake.medication_reference_options(portal_practice),
            attestation: {
              id: Clinic::Care::PrevisitIntake::ATTESTATION_ID,
              version: Clinic::Care::PrevisitIntake::ATTESTATION_VERSION,
              label: "I confirm this information is current and may be shared with my care team."
            }
          },
          reusable_answers: previous_intake && {
            source_note_id: previous.id,
            source_version: previous.version_number,
            author_id: previous.submitted_by_user_id,
            submitted_at: previous.submitted_at.iso8601(6),
            answers: previous_intake["answers"].slice(
              *form[:fields].select { |field| field[:reusable] }.map { |field| field[:id] }
            )
          },
          can_edit: PrevisitNotes.editable?(appointment)
        }
      end

      def request_key!(value)
        key = required_string!(value, field: :request_key, maximum: 160)
        return key if key.match?(Clinic::Idempotency::KEY_PATTERN)

        raise Clinic::Api::RequestParameters::Invalid.new(
          "request_key must match the clinic idempotency key format.", field: :request_key
        )
      end
    end
  end
end
