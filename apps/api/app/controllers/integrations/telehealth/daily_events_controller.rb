module Integrations
  module Telehealth
    class DailyEventsController < ApplicationController
      MAX_BODY_BYTES = 131_072
      RATE_LIMIT = 120
      skip_forgery_protection only: :create

      def create
        head :payload_too_large and return if request.content_length.to_i > MAX_BODY_BYTES
        raw_body = request.raw_post
        head :payload_too_large and return if raw_body.bytesize > MAX_BODY_BYTES
        payload = JSON.parse(raw_body)
        if payload == { "test" => "test" }
          head :ok
          return
        end
        throttle!
        Clinic::Telehealth::Providers::Daily.verify_event(raw_body: raw_body,
          signature: request.headers["X-Webhook-Signature"], timestamp: request.headers["X-Webhook-Timestamp"])
        PaperTrail.request.whodunnit = "provider:daily"
        PaperTrail.request.controller_info = { request_id: request.request_id,
          causal_id: "daily-webhook", job_id: nil }
        Clinic::Telehealth::IngestProviderEvent.call(provider_code: "daily", raw_body: raw_body, payload: payload)
        head :no_content
      rescue JSON::ParserError, Clinic::Telehealth::Providers::Daily::Rejected, ActiveRecord::RecordNotFound
        head :unauthorized
      rescue RateLimited
        head :too_many_requests
      rescue StandardError => error
        Rails.logger.error("telehealth_daily_webhook_failed error=#{error.class.name}")
        head :service_unavailable
      ensure
        PaperTrail.request.whodunnit = nil
        PaperTrail.request.controller_info = {}
      end

      private

      def throttle!
        bucket = Time.current.to_i / 60
        key = "telehealth:daily:webhook:#{request.remote_ip}:#{bucket}"
        count = Rails.cache.increment(key, 1, expires_in: 2.minutes) || 1
        raise RateLimited if count > RATE_LIMIT
      end

      class RateLimited < StandardError; end
    end
  end
end
