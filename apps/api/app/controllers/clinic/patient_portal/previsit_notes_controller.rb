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
        input = parameter_hash!(:previsit_note, %i[text expected_version request_key])
        unless input.key?(:text)
          raise Clinic::Api::RequestParameters::Invalid.new("text is required.", field: :text)
        end
        text = optional_string(
          input[:text], field: :text, maximum: Clinic::Care::PrevisitNote::MAX_TEXT_LENGTH
        ) || ""
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

      def portal_appointment!
        portal_patient.appointments.find(integer_id!(params[:appointment_id], field: :appointment_id))
      end

      def projection(appointment, note)
        {
          appointment_id: appointment.id,
          note: Clinic::Care::PrevisitNoteSerializer.call(note),
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
