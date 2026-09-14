module Clinic
  module Care
    class NurseWorkflowController < Clinic::ApiController
      def show
        patient, encounter = patient_and_encounter
        render json: NurseWorkflow.workspace(
          practice: current_practice, actor: current_user, patient:, encounter:
        )
      end

      def revise_intake
        patient, encounter = patient_and_encounter
        input = parameter_hash!(:intake,
          %i[request_key expected_version status identity_state visit_reason_state history_state vitals_state questionnaire],
          arrays: %i[observation_ids history_review_ids])
        questionnaire = params[:intake][:questionnaire]
        if questionnaire && !questionnaire.is_a?(ActionController::Parameters)
          raise ArgumentError, "Questionnaire must be an object."
        end
        revision = NurseWorkflow.revise_intake(
          practice: current_practice, actor: current_user, patient:, encounter:,
          request_key: request_key!(input[:request_key]),
          expected_version: bounded_integer!(input[:expected_version], field: :expected_version, min: 0, max: 2_147_483_647),
          attributes: input.slice(:status, :identity_state, :visit_reason_state, :history_state, :vitals_state).to_h.merge(
            questionnaire: questionnaire&.to_unsafe_h),
          observation_ids: input.fetch(:observation_ids, []), history_review_ids: input.fetch(:history_review_ids, [])
        )
        render json: { intake: NurseWorkflow.serialize_intake(revision) }, status: :created
      end

      def request_handoff
        patient, encounter = patient_and_encounter
        input = parameter_hash!(:handoff, %i[intake_revision_id request_key])
        handoff = NurseWorkflow.request_handoff(
          practice: current_practice, actor: current_user, patient:, encounter:,
          intake_revision_id: requested_id!(input[:intake_revision_id], :intake_revision_id),
          request_key: request_key!(input[:request_key])
        )
        render json: { handoff: NurseWorkflow.serialize_handoff(handoff) }, status: :created
      end

      def transition_handoff
        handoff = Clinic::EncounterHandoff.where(practice_id: current_practice.id)
          .includes(:encounter).find(requested_id!(params[:id], :id))
        input = parameter_hash!(:handoff, %i[action expected_version request_key])
        handoff = NurseWorkflow.transition_handoff(
          practice: current_practice, actor: current_user, handoff:,
          action: required_string!(input[:action], field: :action, maximum: 32),
          expected_version: bounded_integer!(input[:expected_version], field: :expected_version, min: 0, max: 2_147_483_647),
          request_key: request_key!(input[:request_key])
        )
        render json: { handoff: NurseWorkflow.serialize_handoff(handoff) }
      end

      def create_task
        patient, encounter = patient_and_encounter
        input = parameter_hash!(:task,
          %i[request_key task_kind pool_code assigned_to_membership_id due_at])
        task = NurseWorkflow.create_task(
          practice: current_practice, actor: current_user, patient:, encounter:,
          request_key: request_key!(input[:request_key]), attributes: input.except(:request_key)
        )
        render json: { task: NurseWorkflow.serialize_task(task) }, status: :created
      end

      def transition_task
        task = Clinic::ClinicalTask.where(practice_id: current_practice.id)
          .includes(:encounter).find(requested_id!(params[:id], :id))
        input = parameter_hash!(:task, %i[action expected_version request_key resolution_code assignee_membership_id],
          arrays: %i[dependency_ids])
        task = NurseWorkflow.transition_task(
          practice: current_practice, actor: current_user, task:,
          action: required_string!(input[:action], field: :action, maximum: 24),
          expected_version: bounded_integer!(input[:expected_version], field: :expected_version, min: 0, max: 2_147_483_647),
          request_key: request_key!(input[:request_key]), resolution_code: input[:resolution_code],
          assignee_membership_id: input[:assignee_membership_id], dependency_ids: input[:dependency_ids]
        )
        render json: { task: NurseWorkflow.serialize_task(task) }
      end

      private

      def patient_and_encounter
        patient = current_practice.patients.accessible_by(current_ability, :read)
          .find(requested_id!(params[:patient_id], :patient_id))
        encounter = current_practice.encounters.where(patient:)
          .find(requested_id!(params[:encounter_id], :encounter_id))
        [ patient, encounter ]
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
