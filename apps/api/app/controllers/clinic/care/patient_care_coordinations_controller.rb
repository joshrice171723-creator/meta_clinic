module Clinic
  module Care
    class PatientCareCoordinationsController < Clinic::ApiController
      before_action -> { require_capability("patients.read") }
      before_action -> { require_capability("patients.write") }, only: :create

      def show
        patient = scoped_patient
        PatientCareCoordination.authorize!(practice: current_practice, actor: current_user, patient:)
        record = PatientCareCoordination.scope(practice: current_practice, patient:).order(revision: :desc).first
        render json: envelope(record, patient)
      end

      def create
        patient = scoped_patient
        input = params.require(:care_coordination)
        unless input.is_a?(ActionController::Parameters) &&
            (input.keys - %w[payload expected_revision request_key]).empty? &&
            input[:payload].is_a?(ActionController::Parameters)
          raise ArgumentError, "Provide coordination payload, expected revision and request key."
        end
        record = PatientCareCoordination.save!(practice: current_practice, actor: current_user, patient:,
          payload: input[:payload].to_unsafe_h.deep_stringify_keys,
          expected_revision: bounded_integer!(input[:expected_revision], field: :expected_revision, max: 2_147_483_646),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160))
        render json: envelope(record, patient), status: :created
      end

      def references
        patient = scoped_patient
        render json: PatientCareCoordination.references(practice: current_practice, actor: current_user, patient:,
          kind: params[:kind].to_s, query: params[:q].to_s)
      end

      private

      def scoped_patient
        current_practice.patients.accessible_by(current_ability, :read).find(requested_id!(params[:patient_id], :patient_id))
      end

      def envelope(record, patient)
        { coordination: PatientCareCoordinationSerializer.call(record, patient:),
          can_write: current_ability.can?(:update, patient),
          limits: PatientCareCoordinationRevision::GROUP_LIMITS }
      end

      def sensitive_read_action
        %w[show references].include?(action_name) ? "patients.read" : super
      end
    end
  end
end
