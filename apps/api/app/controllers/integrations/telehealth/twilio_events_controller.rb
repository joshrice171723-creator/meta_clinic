module Integrations
  module Telehealth
    class TwilioEventsController < ApplicationController
      MAX_BODY_BYTES = 131_072
      RATE_LIMIT = 120
      skip_forgery_protection only: :create

      def create
        head :payload_too_large and return if request.content_length.to_i > MAX_BODY_BYTES
        raw_body = request.raw_post
        head :payload_too_large and return if raw_body.bytesize > MAX_BODY_BYTES
        head :unsupported_media_type and return unless request.media_type == "application/x-www-form-urlencoded"
        throttle!
        payload = request.request_parameters.to_h
        callback_url = Clinic::Telehealth::Config.twilio_status_callback_url
        raise Clinic::Telehealth::Providers::Rejected, "The Twilio callback URL is unavailable." unless callback_url
        Clinic::Telehealth::Providers::Twilio.verify_event(url: callback_url, params: payload,
          signature: request.headers["X-Twilio-Signature"])
        PaperTrail.request.whodunnit = "provider:twilio"
        PaperTrail.request.controller_info = { request_id: request.request_id,
          causal_id: "twilio-video-webhook", job_id: nil }
        Clinic::Telehealth::IngestProviderEvent.call(provider_code: "twilio", raw_body: raw_body, payload: payload)
        head :no_content
      rescue Clinic::Telehealth::Providers::Rejected, ActiveRecord::RecordNotFound
        head :unauthorized
      rescue RateLimited
        head :too_many_requests
      rescue StandardError => error
        Rails.logger.error("telehealth_twilio_webhook_failed error=#{error.class.name}")
        head :service_unavailable
      ensure
        PaperTrail.request.whodunnit = nil
        PaperTrail.request.controller_info = {}
      end

      private

      def throttle!
        bucket = Time.current.to_i / 60
        key = "telehealth:twilio:webhook:#{request.remote_ip}:#{bucket}"
        count = Rails.cache.increment(key, 1, expires_in: 2.minutes) || 1
        raise RateLimited if count > RATE_LIMIT
      end

      class RateLimited < StandardError; end
    end
  end
end
