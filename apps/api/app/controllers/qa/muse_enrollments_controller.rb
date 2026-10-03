module Qa
  class MuseEnrollmentsController < ApplicationController
    before_action :require_owner_session!

    rescue_from MuseWrites::Denied do |error|
      render json: { error: error.message, code: "owner_approval_required" }, status: :forbidden
    end
    rescue_from MuseWrites::Conflict do |error|
      render json: { error: error.message, code: "muse_conflict" }, status: :conflict
    end
    rescue_from ArgumentError, ActiveRecord::RecordInvalid, ActionController::ParameterMissing do |error|
      render json: { error: error.message, code: "invalid_enrollment_request" }, status: :unprocessable_entity
    end

    def approve
      render json: MuseWrites.enroll!(user: current_user, input: body!), status: :created
    end

    def revoke
      render json: MuseWrites.revoke!(user: current_user, input: body!)
    end

    private

    def require_owner_session!
      raise MuseWrites::Denied, "An interactive platform-owner session is required." if request.authorization.present? ||
        current_user&.active? != true || current_user&.platform_owner? != true
    end

    def body!
      body = JSON.parse(request.raw_post, allow_duplicate_key: false)
      raise ArgumentError, "A JSON object is required." unless body.is_a?(Hash) && body.keys.all? { |key| key.is_a?(String) }
      body
    rescue JSON::ParserError
      raise ArgumentError, "A valid JSON object is required."
    end
  end
end
