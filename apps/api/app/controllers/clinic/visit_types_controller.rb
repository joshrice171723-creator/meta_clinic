module Clinic
  class VisitTypesController < ApiController
    before_action :authorize_visit_type_write!

    def create
      input = parameter_hash!(:visit_type, %i[request_key code])
      attributes = { code: required_string!(input[:code], field: :code, maximum: 80) }
      outcome = execute_idempotently(
        operation_code: "facilities.visit_type.create",
        request_key: input[:request_key],
        payload: attributes
      ) do
        current_practice.visit_types.create!(attributes)
      end

      render_visit_type(outcome, created: true)
    end

    def update
      visit_type = current_practice.visit_types.find(requested_id!(params[:id], :id))
      input = parameter_hash!(:visit_type, %i[request_key code active])
      attributes = {}
      attributes[:code] = required_string!(input[:code], field: :code, maximum: 80) if input.key?(:code)
      attributes[:active] = boolean_param(input[:active], field: :active) if input.key?(:active)
      raise ArgumentError, "Provide a visit type name or status to update." if attributes.empty?

      outcome = execute_idempotently(
        operation_code: "facilities.visit_type.update",
        request_key: input[:request_key],
        payload: { visit_type_id: visit_type.id, attributes: attributes },
        resource: visit_type
      ) do
        visit_type.with_lock do
          visit_type.code = attributes[:code] if attributes.key?(:code)
          visit_type.retired_at = attributes[:active] ? nil : Time.current if attributes.key?(:active)
          visit_type.save!
        end
        visit_type
      end

      render_visit_type(outcome)
    end

    private

    def authorize_visit_type_write!
      Clinic::Authorization.authorize_with_legacy!(
        actor: current_user,
        practice: current_practice,
        action: "facilities.write",
        legacy_action: "appointments.write"
      )
    end

    def execute_idempotently(operation_code:, request_key:, payload:, resource: nil, &block)
      outcome = Clinic::Idempotency.execute(
        practice: current_practice,
        actor: current_user,
        operation_code: operation_code,
        request_key: required_string!(request_key, field: :request_key, maximum: 160),
        payload: payload,
        resource: resource,
        authorization: -> { authorize_visit_type_write! },
        result_resource: ->(visit_type) { visit_type },
        resource_resolver: ->(practice:, receipt:) { practice.visit_types.find_by(id: receipt.resource_id) },
        &block
      )
      raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

      outcome
    end

    def render_visit_type(outcome, created: false)
      visit_type = outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed visit type is unavailable.")
      status = created && !outcome.replayed ? :created : :ok
      render json: { visit_type: FacilitySerializer.visit_type(visit_type) }, status: status
    end
  end
end
