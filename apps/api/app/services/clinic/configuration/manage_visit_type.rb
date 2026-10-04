module Clinic
  module Configuration
    class ManageVisitType
      include Clinic::Api::RequestParameters

      def self.create(practice:, actor:, input:)
        new(practice:, actor:).create(input)
      end

      def self.update(practice:, actor:, visit_type:, input:, expected_updated_at: nil)
        new(practice:, actor:).update(visit_type, input, expected_updated_at:)
      end

      def initialize(practice:, actor:)
        @practice, @actor = practice, actor
      end

      def create(input)
        authorize_visit_type_write!
        input = input.to_h.with_indifferent_access
        attributes = { code: required_string!(input[:code], field: :code, maximum: 80) }
        outcome = execute_idempotently(
          operation_code: "facilities.visit_type.create",
          request_key: input[:request_key],
          payload: attributes
        ) do
          @practice.visit_types.create!(attributes)
        end

        outcome
      end

      def update(visit_type, input, expected_updated_at: nil)
        authorize_visit_type_write!
        visit_type = @practice.visit_types.find(visit_type.id)
        input = input.to_h.with_indifferent_access
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
            raise ActiveRecord::StaleObjectError.new(visit_type, "update visit type") if expected_updated_at && visit_type.updated_at != expected_updated_at
            visit_type.code = attributes[:code] if attributes.key?(:code)
            visit_type.retired_at = attributes[:active] ? nil : Time.current if attributes.key?(:active)
            visit_type.save!
          end
          visit_type
        end

        outcome
      end

      private

      def authorize_visit_type_write!
        Clinic::Authorization.authorize_with_legacy!(
          actor: @actor,
          practice: @practice,
          action: "facilities.write",
          legacy_action: "appointments.write"
        )
      end

      def execute_idempotently(operation_code:, request_key:, payload:, resource: nil, &block)
        outcome = Clinic::Idempotency.execute(
          practice: @practice,
          actor: @actor,
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
    end
  end
end
