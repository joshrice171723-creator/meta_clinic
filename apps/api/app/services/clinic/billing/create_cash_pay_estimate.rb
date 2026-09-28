module Clinic
  module Billing
    class CreateCashPayEstimate
      def self.call(practice:, actor:, patient:, classification:, currency:, lines:, request_key:)
        authorize!(practice: practice, actor: actor)
        classification = classification.to_s
        raise ArgumentError, "Choose a supported estimate classification." unless %w[general_estimate gfe_candidate].include?(classification)
        currency = currency.to_s
        raise ArgumentError, "Currency must be a three-letter uppercase code." unless currency.match?(/\A[A-Z]{3}\z/)
        request_lines = normalize_request_lines(lines)
        outcome = Clinic::Idempotency.execute(practice: practice, actor: actor, operation_code: "cash_pay_estimate.create", request_key: request_key,
          payload: { patient_id: patient&.id, classification: classification, currency: currency, lines: request_lines }, authorization: -> { authorize!(practice: practice, actor: actor) },
          authorization_action: "billing.invoice_draft", result_resource: ->(estimate) { estimate }, resource_resolver: ->(practice:, receipt:) { CashPayEstimate.find_by(practice: practice, id: receipt.resource_id) }) do
          ApplicationRecord.transaction do
            normalized = normalize_lines(practice: practice, currency: currency, lines: request_lines)
            estimate = CashPayEstimate.create!(practice: practice, patient: patient, classification: classification, status: "draft", currency: currency)
            normalized.each { |line| estimate.lines.create!(line.merge(practice: practice)) }
            AuditRecorder.record!(practice: practice, actor: actor, action_code: "cash_pay_estimate.create", outcome: :committed, resource_version_ref: "cash_pay_estimate/#{estimate.id}:#{estimate.revision}")
            estimate
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def self.normalize_lines(practice:, currency:, lines:, historical_pairs: [])
        raise ArgumentError, "An estimate needs at least one service line." unless lines.is_a?(Array) && lines.any?
        lines.map do |item|
          values = item.to_h.symbolize_keys
          service = practice.billing_services.lock.find(values.fetch(:billing_service_id))
          raise ArgumentError, "The selected service is inactive." unless service.active?
          raise ArgumentError, "Selected services must use the estimate currency." unless service.currency == currency
          quantity = Money.decimal(values.fetch(:quantity), name: "quantity", positive: true)
          offering = values[:service_offering_id] && practice.service_offerings.find(values[:service_offering_id])
          if offering && !historical_pairs.include?([ offering.id, service.id ])
            raise ArgumentError, "Choose a published offering linked to the selected service." unless offering.published? && offering.billing_service_id == service.id
          end
          { billing_service: service, service_offering: offering, quantity: quantity.to_s("F"), unit_amount: service.unit_amount.to_s("F"), expected_amount: Money.line_total(quantity: quantity, unit_amount: service.unit_amount), description_snapshot: [ service.name, service.description ].compact.join(" — "), inclusions: values[:inclusions].to_s.strip.presence, exclusions: values[:exclusions].to_s.strip.presence }
        end
      end

      def self.normalize_request_lines(lines)
        raise ArgumentError, "An estimate needs at least one service line." unless lines.is_a?(Array) && lines.any?

        lines.map do |item|
          values = item.to_h.symbolize_keys
          service_id = Integer(values.fetch(:billing_service_id).to_s, 10)
          offering_id = values[:service_offering_id].present? ? Integer(values[:service_offering_id].to_s, 10) : nil
          raise ArgumentError, "Choose a valid billing service and offering." unless service_id.positive? && (!offering_id || offering_id.positive?)

          {
            billing_service_id: service_id,
            service_offering_id: offering_id,
            quantity: Money.decimal(values.fetch(:quantity), name: "quantity", positive: true).to_s("F"),
            inclusions: values[:inclusions].to_s.strip.presence,
            exclusions: values[:exclusions].to_s.strip.presence
          }
        rescue KeyError, TypeError, ArgumentError
          raise ArgumentError, "Each estimate line needs valid service, offering, and quantity values."
        end
      end

      def self.authorize!(practice:, actor:)
        Authorization.authorize_with_legacy!(practice: practice, actor: actor, action: "billing.invoice_draft", legacy_action: "billing.write")
      end
      private_class_method :authorize!
    end
  end
end
