module Clinic
  module Care
    class VitalSignsController < Clinic::ApiController
      before_action -> { require_capability("patients.read") }

      rescue_from VitalSigns::DictionaryMismatch do |error|
        render json: { error: error.message, code: "stale_dictionary" }, status: :conflict
      end

      def show
        patient, encounter = patient_and_encounter
        render json: {
          encounter_id: encounter.id,
          dictionary_version: VitalSigns::DICTIONARY_VERSION,
          code_system: VitalSigns::CODE_SYSTEM,
          can_write: encounter.status == "open" && encounter.ended_at.nil? &&
            current_ability.allowed_permission?("observations.write", site: encounter.site),
          fields: VitalSigns.fields
        }
      end

      def create
        patient, encounter = patient_and_encounter
        input = parameter_hash!(
          :vital_signs,
          %i[request_key dictionary_version observed_at confirmed_patient],
          nested_arrays: { readings: %i[code value unit_code] }
        )
        readings = input.fetch(:readings, []).map.with_index do |reading, index|
          {
            code: required_string!(reading[:code], field: "readings.#{index}.code", maximum: 160),
            value: vital_decimal!(reading[:value], field: "readings.#{index}.value"),
            unit_code: required_string!(reading[:unit_code], field: "readings.#{index}.unit_code", maximum: 80)
          }
        end
        observations = VitalSigns.record(
          practice: current_practice, actor: current_user, patient:, encounter:,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          dictionary_version: required_string!(input[:dictionary_version], field: :dictionary_version, maximum: 80),
          observed_at: time_param!(input[:observed_at], field: :observed_at),
          confirmed_patient: boolean_param(input[:confirmed_patient], field: :confirmed_patient),
          readings:
        )
        render json: { observations: observations.map { |observation| ObservationSerializer.call(observation) } }, status: :created
      end

      private

      def patient_and_encounter
        patient = current_practice.patients.accessible_by(current_ability, :read)
          .find(requested_id!(params[:patient_id], :patient_id))
        encounter = current_practice.encounters.where(patient: patient)
          .find(requested_id!(params[:encounter_id], :encounter_id))
        [ patient, encounter ]
      end

      def vital_decimal!(value, field:)
        text = value.to_s
        unless text.length.between?(1, 30) && text.match?(/\A[+-]?\d+(?:\.\d+)?\z/)
          raise Clinic::Api::RequestParameters::Invalid.new(
            "#{field} must be a finite exact decimal string.", field:
          )
        end

        text
      end
    end
  end
end
