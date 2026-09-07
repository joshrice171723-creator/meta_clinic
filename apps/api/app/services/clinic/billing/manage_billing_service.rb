module Clinic
  module Billing
    class ManageBillingService
      CREATE_OPERATION = "billing.catalog.create"
      UPDATE_OPERATION = "billing.catalog.update"

      Result = Data.define(:service, :replayed)

      def self.create(practice:, actor:, request_key:, attributes:)
        Authorization.authorize!(practice: practice, actor: actor, action: "billing.catalog.manage")
        normalized = normalize_create(attributes)
        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: CREATE_OPERATION,
          request_key: request_key,
          payload: normalized,
          authorization: -> { Authorization.authorize!(practice: practice, actor: actor, action: "billing.catalog.manage") },
          authorization_action: "billing.catalog.manage",
          result_resource: ->(service) { service },
          resource_resolver: ->(practice:, receipt:) { practice.billing_services.find_by(id: receipt.resource_id) }
        ) do
          service = practice.billing_services.create!(normalized)
          audit!(practice: practice, actor: actor, service: service, action: "billing.catalog.create")
          service
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        Result.new(service: outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed service is unavailable."), replayed: outcome.replayed)
      end

      def self.update(practice:, actor:, service:, request_key:, lock_version:, attributes:)
        Authorization.authorize!(practice: practice, actor: actor, action: "billing.catalog.manage")
        service = practice.billing_services.find(service.id)
        normalized = normalize_update(attributes)
        expected_lock_version = Integer(lock_version.to_s, 10)
        raise ArgumentError, "lock_version must be zero or greater." if expected_lock_version.negative?

        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: UPDATE_OPERATION,
          request_key: request_key,
          payload: { service_id: service.id, lock_version: expected_lock_version, attributes: normalized },
          authorization: -> { Authorization.authorize!(practice: practice, actor: actor, action: "billing.catalog.manage") },
          authorization_action: "billing.catalog.manage",
          result_resource: ->(updated) { updated },
          resource_resolver: ->(practice:, receipt:) { practice.billing_services.find_by(id: receipt.resource_id) }
        ) do
          locked = practice.billing_services.lock.find(service.id)
          raise ActiveRecord::StaleObjectError.new(locked, "update") unless locked.lock_version == expected_lock_version

          locked.update!(normalized)
          audit!(practice: practice, actor: actor, service: locked, action: "billing.catalog.update")
          locked
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        Result.new(service: outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed service is unavailable."), replayed: outcome.replayed)
      rescue ArgumentError => error
        raise error unless error.message.match?(/invalid value for Integer/)

        raise ArgumentError, "lock_version must be a whole number."
      end

      def self.normalize_create(attributes)
        {
          name: required_text(attributes[:name], field: "name", maximum: 160),
          code: optional_text(attributes[:code], field: "code", maximum: 50),
          description: optional_text(attributes[:description], field: "description", maximum: 500),
          unit_amount: Money.currency_amount(attributes[:unit_amount], name: "unit amount").to_s("F"),
          currency: currency(attributes[:currency]),
          active: attributes.key?(:active) ? boolean(attributes[:active], field: "active") : true
        }
      end
      private_class_method :normalize_create

      def self.normalize_update(attributes)
        normalized = {}
        normalized[:name] = required_text(attributes[:name], field: "name", maximum: 160) if attributes.key?(:name)
        normalized[:code] = optional_text(attributes[:code], field: "code", maximum: 50) if attributes.key?(:code)
        normalized[:description] = optional_text(attributes[:description], field: "description", maximum: 500) if attributes.key?(:description)
        normalized[:unit_amount] = Money.currency_amount(attributes[:unit_amount], name: "unit amount").to_s("F") if attributes.key?(:unit_amount)
        normalized[:currency] = currency(attributes[:currency]) if attributes.key?(:currency)
        normalized[:active] = boolean(attributes[:active], field: "active") if attributes.key?(:active)
        raise ArgumentError, "Provide at least one service field to update." if normalized.empty?

        normalized
      end
      private_class_method :normalize_update

      def self.required_text(value, field:, maximum:)
        text = value.to_s.strip
        raise ArgumentError, "#{field} is required." if text.empty?
        raise ArgumentError, "#{field} must be at most #{maximum} characters." if text.length > maximum

        text
      end
      private_class_method :required_text

      def self.optional_text(value, field:, maximum:)
        text = value.to_s.strip
        return nil if text.empty?
        raise ArgumentError, "#{field} must be at most #{maximum} characters." if text.length > maximum

        text
      end
      private_class_method :optional_text

      def self.currency(value)
        code = value.to_s
        return code if code.match?(/\A[A-Z]{3}\z/)

        raise ArgumentError, "currency must be a three-letter uppercase code."
      end
      private_class_method :currency

      def self.boolean(value, field:)
        return value if value == true || value == false

        raise ArgumentError, "#{field} must be true or false."
      end
      private_class_method :boolean

      def self.audit!(practice:, actor:, service:, action:)
        Clinic::AuditRecorder.record!(practice: practice, actor: actor, action_code: action,
          outcome: :committed, resource_version_ref: "billing_service:#{service.id}:#{service.lock_version}")
      end
      private_class_method :audit!
    end
  end
end
