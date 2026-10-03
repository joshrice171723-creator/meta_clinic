module Qa
  class MuseWritesController < ApplicationController
    skip_before_action :verify_authenticity_token
    before_action :authenticate_muse!

    rescue_from MuseRequestAuthenticator::Unauthorized do |error|
      render json: { error: error.message, code: "muse_unauthorized" }, status: :unauthorized
    end
    rescue_from MuseWrites::Denied, OfficeActorPolicy::Denied do |error|
      render json: { error: error.message, code: "muse_scope_denied" }, status: :forbidden
    end
    rescue_from MuseWrites::Conflict do |error|
      render json: { error: error.message, code: "muse_conflict" }, status: :conflict
    end
    rescue_from MuseEvidence::ArchiveFailed do |error|
      render json: { error: error.message, code: "screenshot_archive_failed" }, status: :unprocessable_entity
    end
    rescue_from ArgumentError, ActiveRecord::RecordInvalid, ActionController::ParameterMissing do |error|
      render json: { error: error.message, code: "invalid_muse_request" }, status: :unprocessable_entity
    end

    def claim
      render json: MuseWrites.claim!(credential: @credential, auth: @auth, input: body!), status: :created
    end

    def verdict
      render json: MuseWrites.verdict!(credential: @credential, auth: @auth, input: body!), status: :created
    end

    def defect
      render json: MuseWrites.defect!(credential: @credential, auth: @auth, input: body!), status: :created
    end

    def prepare_test_data
      render json: MuseWrites.prepare_test_data!(credential: @credential, auth: @auth, input: body!), status: :created
    end

    def retest_request
      render json: MuseWrites.retest!(credential: @credential, auth: @auth, input: body!), status: :created
    end

    private

    def authenticate_muse!
      @credential, @auth = MuseRequestAuthenticator.authenticate!(request)
      response.headers["Cache-Control"] = "no-store"
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
