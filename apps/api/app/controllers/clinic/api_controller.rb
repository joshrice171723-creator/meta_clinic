module Clinic
  class ApiController < BaseController
    rescue_from Clinic::Idempotency::Conflict do
      render json: { error: "That request key was already used for different operation data.", code: "idempotency_conflict" }, status: :conflict
    end

    rescue_from Clinic::Idempotency::InvalidRequest do |error|
      render json: { error: error.message, code: "invalid_request" }, status: :bad_request
    end

    rescue_from Clinic::Idempotency::OutcomeUnconfirmed do
      render json: {
        error: "The operation outcome is unconfirmed. Look up the protected receipt before retrying.",
        code: "outcome_unconfirmed"
      }, status: :conflict
    end

    rescue_from ActiveRecord::StaleObjectError do
      render json: { error: "This record changed. Reload before trying again.", code: "stale_record" }, status: :conflict
    end

    rescue_from ArgumentError do |error|
      render json: { error: error.message, code: "invalid_request" }, status: :unprocessable_entity
    end

    rescue_from ActiveRecord::RecordNotUnique do
      render json: { error: "That request conflicts with an existing record.", code: "already_exists" }, status: :conflict
    end

    private

    def practice_records(relation)
      relation.where(practice_id: current_practice.id)
    end

    def requested_id!(value, field)
      integer_id!(value, field: field)
    end

    def optional_id(value, field)
      value.present? ? requested_id!(value, field) : nil
    end

    def boolean_or_default(value, field:, default: false)
      value.nil? ? default : boolean_param(value, field: field)
    end
  end
end
