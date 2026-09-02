module Clinic
  module Care
    class ObservationsController < Clinic::ApiController
      before_action -> { require_capability("patients.read") }, only: :index

      def index
        observations = current_practice.observations
        if params[:patient_id].present?
          patient = current_practice.patients.find(requested_id!(params[:patient_id], :patient_id))
          observations = patient.observations
          if params[:encounter_id].present?
            encounter = current_practice.encounters.where(patient_id: patient.id).find(requested_id!(params[:encounter_id], :encounter_id))
            observations = observations.where(encounter: encounter)
          end
        elsif params[:encounter_id].present?
          observations = observations.where(encounter_id: requested_id!(params[:encounter_id], :encounter_id))
        end
        observations = observations.where(value_kind: enum_param!(params[:value_kind], field: :value_kind, allowed: %w[numeric text coded missing group])) if params[:value_kind].present?
        if params[:code].present?
          code = required_string!(params[:code], field: :code, maximum: 160)
          observations = observations.where(code: code)
        end
        observations = observations.where("observed_at >= ?", time_param!(params[:from], field: :from)) if params[:from].present?
        observations = observations.where("observed_at < ?", time_param!(params[:to], field: :to)) if params[:to].present?
        paginate(observations, key: :observations, serializer: ->(observation) { ObservationSerializer.call(observation) },
          order: { observed_at: :desc, id: :desc })
      end

      def create
        input = parameter_hash!(:observation, %i[request_key encounter_id parent_observation_id code code_system code_version value_kind numeric_value text_value coded_value unit_code missing_reason observed_at recorded_at])
        patient = current_practice.patients.find(requested_id!(params[:patient_id], :patient_id))
        attributes = {
          encounter_id: optional_id(input[:encounter_id], :encounter_id),
          parent_observation_id: optional_id(input[:parent_observation_id], :parent_observation_id),
          code: required_string!(input[:code], field: :code, maximum: 160),
          code_system: required_string!(input[:code_system], field: :code_system, maximum: 160),
          code_version: required_string!(input[:code_version], field: :code_version, maximum: 80),
          value_kind: enum_param!(input[:value_kind], field: :value_kind, allowed: %w[numeric text coded missing group]),
          numeric_value: input[:numeric_value].present? ? decimal_string!(input[:numeric_value], field: :numeric_value) : nil,
          text_value: optional_string(input[:text_value], field: :text_value, maximum: 100_000),
          coded_value: optional_string(input[:coded_value], field: :coded_value, maximum: 160),
          unit_code: optional_string(input[:unit_code], field: :unit_code, maximum: 80),
          missing_reason: optional_string(input[:missing_reason], field: :missing_reason, maximum: 160),
          observed_at: time_param!(input[:observed_at], field: :observed_at),
          recorded_at: input[:recorded_at].present? ? time_param!(input[:recorded_at], field: :recorded_at) : nil
        }
        observation = Clinic::Care::RecordObservation.call(practice: current_practice, actor: current_user, patient: patient,
          attributes: attributes, request_key: required_string!(input[:request_key], field: :request_key, maximum: 160))
        render json: { observation: ObservationSerializer.call(observation) }, status: :created
      end
    end
  end
end
