module Qa
  class WorkflowCenterController < ApplicationController
    skip_before_action :verify_authenticity_token, if: :service_authenticated?
    before_action :require_workflow_access

    rescue_from OfficeActorPolicy::Denied do |error|
      render json: { error: error.message }, status: :forbidden
    end
    rescue_from WorkflowEvidenceContract::Conflict, OfficeWork::Conflict do |error|
      render json: { error: error.message }, status: :conflict
    end
    rescue_from ArgumentError, ActiveRecord::RecordInvalid do |error|
      render json: { error: error.message }, status: :unprocessable_entity
    end

    def claim
      render json: WorkflowCenter.claim!(user: workflow_user, token: @service_token, input: envelope!(:claim)), status: :created
    end

    def record_evidence
      render json: WorkflowCenter.record_evidence!(user: workflow_user, token: @service_token, input: envelope!(:observation)), status: :created
    end

    private

    def service_authenticated?
      return @service_token.present? if defined?(@service_token)
      header = request.authorization.to_s
      @service_token = ServiceToken.authenticate(header.delete_prefix("Bearer ")) if header.start_with?("Bearer ")
      @service_token.present?
    end

    def workflow_user
      service_authenticated? ? @service_token.user : current_user
    end

    def require_workflow_access
      if request.authorization.present? && !service_authenticated?
        raise OfficeActorPolicy::Denied, "The presented credential is not valid."
      end
      action = action_name == "claim" ? "claim_workflow" : "record_evidence"
      WorkflowCenterAccess.authorize!(user: workflow_user, token: @service_token, action:)
    end

    def envelope!(name)
      input = params.require(name)
      raise ArgumentError, "Provide an object envelope." unless input.is_a?(ActionController::Parameters)
      input.to_unsafe_h
    end
  end
end
