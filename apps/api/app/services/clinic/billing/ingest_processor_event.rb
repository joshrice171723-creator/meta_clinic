require "digest"
require "json"

module Clinic
  module Billing
    class IngestProcessorEvent
      class InvalidPayload < StandardError; end
      class ConflictingEvent < StandardError; end
      Result = Data.define(:event, :duplicate)

      TERMINAL_OUTCOMES = {
        "payment_intent.succeeded" => "succeeded",
        "payment_intent.payment_failed" => "failed",
        "payment_intent.processing" => "processing",
        "payment_intent.canceled" => "canceled"
      }.freeze

      def self.call(practice:, raw_body:, signature_header:, secret:, processor: "stripe", now: Time.current)
        ProcessorWebhookVerifier::Stripe.verify!(raw_body: raw_body, signature_header: signature_header,
          secret: secret, now: now)
        payload = parse_payload(raw_body)
        normalized = normalize(payload, raw_body: raw_body, processor: processor, verified_at: now)

        ApplicationRecord.transaction do
          existing = practice.payment_processor_events.lock.find_by(
            processor: normalized[:processor], processor_event_reference: normalized[:processor_event_reference]
          )
          if existing
            raise ConflictingEvent, "A processor event reference was received with different payload evidence." unless
              existing.raw_payload_digest == normalized[:raw_payload_digest]

            next Result.new(event: existing, duplicate: true)
          end

          intent = practice.payment_collection_intents.find_by(reference: normalized.delete(:collection_intent_reference))
          normalized[:payment_collection_intent] = intent if intent
          normalized[:patient] = intent.patient if intent
          normalized[:processing_state] = intent ? "normalized" : "needs_reconciliation"
          normalized.delete(:collection_intent_reference)
          event = practice.payment_processor_events.create!(normalized)
          Result.new(event: event, duplicate: false)
        end
      rescue ActiveRecord::RecordNotUnique
        retry_existing_event(practice: practice, processor: processor, reference: normalized[:processor_event_reference],
          digest: normalized[:raw_payload_digest])
      end

      def self.parse_payload(raw_body)
        payload = JSON.parse(raw_body.to_s)
        raise InvalidPayload, "Webhook payload is invalid." unless payload.is_a?(Hash)
        raise InvalidPayload, "Webhook payload is missing its event identity." unless payload["id"].is_a?(String) && payload["type"].is_a?(String)

        payload
      rescue JSON::ParserError, TypeError
        raise InvalidPayload, "Webhook payload is invalid."
      end
      private_class_method :parse_payload

      def self.normalize(payload, raw_body:, processor:, verified_at:)
        object = payload.dig("data", "object")
        raise InvalidPayload, "Webhook payload is missing its payment object." unless object.is_a?(Hash)

        event_type = payload.fetch("type")
        outcome = TERMINAL_OUTCOMES.fetch(event_type, "unknown")
        metadata = object["metadata"].is_a?(Hash) ? object["metadata"] : {}
        correlation = metadata["apply_collection_intent"].to_s
        correlation = nil unless correlation.match?(/\Aci_[a-f0-9]{32}\z/)
        object_id = object["id"].to_s
        raise InvalidPayload, "Webhook payment object is missing its identity." if object_id.blank?

        {
          processor: processor.to_s,
          processor_event_reference: payload.fetch("id"),
          processor_intent_reference: object_id,
          event_type: event_type,
          payload_version: payload["api_version"].to_s.presence,
          raw_payload_digest: Digest::SHA256.hexdigest(raw_body.to_s),
          normalized_outcome: outcome,
          processing_state: "signature_verified",
          verified_at: verified_at,
          redacted_payload: redacted_payload(payload, object, correlation),
          collection_intent_reference: correlation
        }
      end
      private_class_method :normalize

      def self.redacted_payload(payload, object, correlation)
        {
          "event_id" => payload["id"].to_s,
          "event_type" => payload["type"].to_s,
          "api_version" => payload["api_version"].to_s.presence,
          "processor_object_id" => object["id"].to_s,
          "amount" => object["amount"].is_a?(Numeric) ? object["amount"] : nil,
          "currency" => object["currency"].to_s.presence,
          "status" => object["status"].to_s.presence,
          "collection_intent_reference" => correlation
        }.compact
      end
      private_class_method :redacted_payload

      def self.retry_existing_event(practice:, processor:, reference:, digest:)
        event = practice.payment_processor_events.find_by(processor: processor.to_s, processor_event_reference: reference)
        raise unless event
        raise ConflictingEvent, "A processor event reference was received with different payload evidence." unless event.raw_payload_digest == digest

        Result.new(event: event, duplicate: true)
      end
      private_class_method :retry_existing_event
    end
  end
end
