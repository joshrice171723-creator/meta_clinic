module Clinic
  module Operations
    class RecallsController < Clinic::ApiController
      def index
        status = enum_param!(params[:status].presence || "due", field: :status,
          allowed: Clinic::Operations::RecallWorklist::FILTERS)
        site_id = params[:site_id].present? ? requested_id!(params[:site_id], :site_id) : nil
        patient_id = params[:patient_id].present? ? requested_id!(params[:patient_id], :patient_id) : nil
        payload = Clinic::Operations::RecallWorklist.call(
          practice: current_practice, actor: current_user, status:, site_id:, patient_id:
        )
        record_read!("recall_worklist:site/#{site_id || 'authorized'}:patient/#{patient_id || 'all'}:status/#{status}")
        render json: payload
      end

      def show
        follow_up = Clinic::EncounterFollowUp.where(practice_id: current_practice.id)
          .find(requested_id!(params[:id], :id))
        payload = Clinic::Operations::RecallWorklist.detail(
          practice: current_practice, actor: current_user, follow_up:
        )
        record_read!("recall/#{follow_up.id}:version/#{follow_up.lock_version}")
        render json: payload
      end

      def create_event
        follow_up = Clinic::EncounterFollowUp.where(practice_id: current_practice.id).includes(encounter: :site)
          .find(requested_id!(params[:id], :id))
        input = parameter_hash!(:recall_event,
          %i[action request_key expected_version occurred_at channel reason snoozed_until completion_evidence])
        Clinic::Operations::RecallEvents.record(
          practice: current_practice, actor: current_user, follow_up:,
          action: required_string!(input[:action], field: :action, maximum: 32),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          expected_version: bounded_integer!(input[:expected_version], field: :expected_version,
            min: 0, max: 2_147_483_647),
          attributes: input.except(:action, :request_key, :expected_version)
        )
        payload = Clinic::Operations::RecallWorklist.detail(
          practice: current_practice, actor: current_user,
          follow_up: Clinic::EncounterFollowUp.where(practice_id: current_practice.id).find(follow_up.id)
        )
        render json: payload
      end

      private

      def record_read!(reference)
        Clinic::AuditRecorder.record!(
          practice: current_practice, actor: current_user,
          action_code: "recall_worklist.read", outcome: :released,
          resource_version_ref: reference
        )
      end
    end
  end
end
