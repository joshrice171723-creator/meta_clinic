module Clinic
  module Care
    class PsychotherapyNotesController < Clinic::ApiController
      def show
        encounter = current_practice.encounters.find(requested_id!(params[:encounter_id], :encounter_id))
        note = PsychotherapyNotes.read(practice: current_practice, actor: current_user, encounter:)
        render json: { note: PsychotherapyNotes.serialize(note),
          history: PsychotherapyNotes.history(practice: current_practice, actor: current_user, encounter:) }
      end

      def update
        encounter = current_practice.encounters.find(requested_id!(params[:encounter_id], :encounter_id))
        input = parameter_hash!(:psychotherapy_note,
          %i[body revision_reason expected_version request_key])
        note = PsychotherapyNotes.save(
          practice: current_practice, actor: current_user, encounter:,
          body: protected_body!(input[:body]),
          revision_reason: input[:revision_reason],
          expected_version: bounded_integer!(input[:expected_version], field: :expected_version,
            min: 0, max: 2_147_483_647),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160)
        )
        render json: { note: PsychotherapyNotes.serialize(note) }
      end

      private

      def protected_body!(value)
        return value if value.is_a?(String) && value.strip.present? && value.length <= 50_000

        raise Clinic::Api::RequestParameters::Invalid.new(
          "body is required and must be at most 50000 characters.", field: :body
        )
      end
    end
  end
end
