require "base64"
require "json"
require "net/http"
require "openssl"

module Clinic
  module Telehealth
    module Providers
      class Daily
        API_BASE = URI("https://api.daily.co/v1/")
        OPEN_TIMEOUT = 3
        READ_TIMEOUT = 8
        WEBHOOK_TOLERANCE = 5.minutes

        Unavailable = Providers::Unavailable
        Rejected = Providers::Rejected
        NotFound = Providers::NotFound
        Unsupported = Providers::Unsupported

        class << self
          def create_room(name:, expires_at:, max_duration_seconds: nil)
            request(:post, "rooms", body: { name: name, privacy: "private", properties: {
              exp: expires_at.to_i, eject_at_room_exp: true, enable_chat: false, enable_knocking: false,
              enable_people_ui: false, enforce_unique_user_ids: true
            } })
          end

          def get_room(name:)
            request(:get, "rooms/#{escape(name)}")
          end

          def room_presence(name:)
            response = request(:get, "rooms/#{escape(name)}/presence")
            raise Unavailable, "The Daily presence response is unavailable." unless response.is_a?(Hash) &&
              response["data"].is_a?(Array) && response.key?("total_count")
            participants = response.fetch("data")
            total_count = response.fetch("total_count")
            raise Unavailable, "The Daily presence response is unavailable." unless total_count.is_a?(Integer)
            raise Unavailable, "The Daily presence response is unavailable." if total_count.negative? ||
              total_count < participants.length
            subject_ids = participants.filter_map do |participant|
              next unless participant.is_a?(Hash)

              participant["userId"] || participant["user_id"]
            end.map(&:to_s).reject(&:blank?).uniq
            {
              confirmed: true,
              total_count: total_count,
              provider_subject_ids: subject_ids,
              participant_identifiers_complete: total_count == participants.length &&
                subject_ids.length == participants.length
            }
          rescue KeyError, ArgumentError, TypeError
            raise Unavailable, "The Daily presence response is unavailable."
          end

          def room_snapshot(name:)
            room = get_room(name: name)
            presence = room_presence(name: name)
            {
              exists: true,
              room_url: room["url"],
              expires_at: room.dig("config", "exp"),
              provider_ended: false,
              presence_confirmed: presence[:confirmed],
              presence_count: presence[:total_count],
              provider_subject_ids: presence[:provider_subject_ids],
              presence_identifiers_complete: presence[:participant_identifiers_complete]
            }
          end

          def issue_join_token(room_name:, participant:, expires_at:, owner:, allow_screen_share:)
            now = Time.current.to_i
            response = request(:post, "meeting-tokens", body: { properties: {
              room_name: room_name, user_id: participant.provider_subject_id, nbf: now - 5,
              exp: expires_at.to_i, is_owner: owner, enable_screenshare: owner && allow_screen_share
            } })
            response.fetch("token")
          end

          def end_room(name:)
            request(:post, "rooms/#{escape(name)}", body: { properties: {
              exp: Time.current.to_i + 1, eject_at_room_exp: true
            } })
          end

          def extend_room(name:, expires_at:)
            request(:post, "rooms/#{escape(name)}", body: { properties: { exp: expires_at.to_i, eject_at_room_exp: true } })
          end

          def eject_participant(name:, provider_session_ref:)
            raise Unsupported, "Daily does not expose an approved account REST operation for server-side individual ejection."
          end

          def delete_room(name:)
            request(:delete, "rooms/#{escape(name)}")
          end

          def health
            request(:get, "rooms?limit=1")
            { status: "ready" }
          end

          def verify_event(raw_body:, signature:, timestamp:, now: Time.current)
            secret = Config.daily_webhook_secret
            raise Rejected, "The webhook secret is unavailable." unless secret
            event_time = Time.at(Integer(timestamp, 10))
            raise Rejected, "The webhook timestamp is outside the accepted window." if (now - event_time).abs > WEBHOOK_TOLERANCE
            decoded = Base64.strict_decode64(secret)
            expected = Base64.strict_encode64(OpenSSL::HMAC.digest("SHA256", decoded, "#{timestamp}.#{raw_body}"))
            supplied = signature.to_s
            valid = expected.bytesize == supplied.bytesize && ActiveSupport::SecurityUtils.secure_compare(expected, supplied)
            raise Rejected, "The webhook signature is invalid." unless valid
            true
          rescue ArgumentError
            raise Rejected, "The webhook signature is invalid."
          end

          def normalize_event(payload)
            value = payload.respond_to?(:to_h) ? payload.to_h.stringify_keys : {}
            body = value.fetch("payload", {}).to_h.stringify_keys
            {
              provider_event_id: value.fetch("id").to_s.first(160),
              event_type: value.fetch("type").to_s.first(48),
              room_name: body.fetch("room").to_s.first(128),
              provider_subject_id: body["user_id"].to_s.presence,
              provider_session_ref: body["session_id"].to_s.first(160).presence,
              occurred_at: Time.at(Float(value.fetch("event_ts"))),
              metadata: {
                "duration_seconds" => body["duration"],
                "owner" => body["owner"],
                "has_presence" => body.dig("permissions", "hasPresence")
              }.compact
            }
          rescue KeyError, ArgumentError, TypeError
            raise Rejected, "The webhook payload is unsupported."
          end

          private

          def request(method, path, body: nil)
            api_key = Config.daily_api_key
            raise Unavailable, "The Daily API key is unavailable." unless api_key
            uri = URI.join(API_BASE.to_s, path)
            klass = { get: Net::HTTP::Get, post: Net::HTTP::Post, delete: Net::HTTP::Delete }.fetch(method)
            http_request = klass.new(uri)
            http_request["Authorization"] = "Bearer #{api_key}"
            http_request["Content-Type"] = "application/json"
            http_request.body = JSON.generate(body) if body
            response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: OPEN_TIMEOUT,
              read_timeout: READ_TIMEOUT, write_timeout: READ_TIMEOUT) do |http|
              http.max_retries = 0 if http.respond_to?(:max_retries=)
              http.request(http_request)
            end
            parsed = response.body.present? ? JSON.parse(response.body) : {}
            return parsed if response.code.to_i.between?(200, 299)
            raise NotFound, "Daily could not find the provider resource." if response.code.to_i == 404
            raise Rejected, "Daily rejected the provider request (HTTP #{response.code})." if response.code.to_i.between?(400, 499)
            raise Unavailable, "Daily is temporarily unavailable."
          rescue JSON::ParserError, Net::OpenTimeout, Net::ReadTimeout, IOError, SystemCallError, OpenSSL::SSL::SSLError
            raise Unavailable, "The Daily provider outcome is unavailable."
          end

          def escape(value)
            raise ArgumentError, "The provider room name is invalid." unless value.to_s.match?(/\A[A-Za-z0-9_-]{1,128}\z/)
            value.to_s
          end
        end
      end
    end
  end
end
