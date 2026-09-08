require "base64"
require "digest"
require "json"
require "net/http"
require "openssl"
require "time"
require "twilio-ruby"
require "uri"

module Clinic
  module Telehealth
    module Providers
      class Twilio
        API_BASE = URI("https://video.twilio.com/v1/")
        OPEN_TIMEOUT = 3
        READ_TIMEOUT = 8
        MAX_PAGE_SIZE = 1_000

        class << self
          def create_room(name:, expires_at:, max_duration_seconds:)
            duration = (expires_at - Time.current).ceil.clamp(60, 86_400)
            timeout_minutes = (duration / 60.0).ceil.clamp(1, 60)
            response = request(:post, "Rooms", form: {
              "UniqueName" => name,
              "Type" => "group",
              "StatusCallback" => Config.twilio_status_callback_url.to_s,
              "StatusCallbackMethod" => "POST",
              "RecordParticipantsOnConnect" => false,
              "MaxParticipantDuration" => Integer(max_duration_seconds).clamp(60, 86_400),
              "EmptyRoomTimeout" => timeout_minutes,
              "UnusedRoomTimeout" => timeout_minutes
            })
            validate_room!(response, expected_name: name)
            { "url" => nil, "sid" => response.fetch("sid"), "unique_name" => response.fetch("unique_name") }
          end

          def get_room(name:)
            response = request(:get, "Rooms/#{escape(name)}")
            validate_room!(response, expected_name: name)
            response
          end

          def room_presence(name:)
            response = request(:get, "Rooms/#{escape(name)}/Participants?Status=connected&PageSize=#{MAX_PAGE_SIZE}")
            participants = response["participants"]
            meta = response["meta"]
            unless participants.is_a?(Array) && meta.is_a?(Hash) && meta["key"] == "participants" &&
                meta["next_page_url"].blank?
              raise Unavailable, "The Twilio presence response is incomplete."
            end
            identities = participants.map do |participant|
              raise Unavailable, "The Twilio presence response is incomplete." unless participant.is_a?(Hash) &&
                participant["status"] == "connected" && participant["identity"].present?
              participant.fetch("identity").to_s
            end
            {
              confirmed: true,
              total_count: participants.length,
              provider_subject_ids: identities.uniq,
              participant_identifiers_complete: identities.uniq.length == participants.length
            }
          rescue KeyError, TypeError
            raise Unavailable, "The Twilio presence response is incomplete."
          end

          def room_snapshot(name:)
            room = get_room(name: name)
            presence = room_presence(name: name)
            {
              exists: true,
              room_url: nil,
              expires_at: nil,
              provider_ended: room.fetch("status") == "completed",
              presence_confirmed: presence[:confirmed],
              presence_count: presence[:total_count],
              provider_subject_ids: presence[:provider_subject_ids],
              presence_identifiers_complete: presence[:participant_identifiers_complete]
            }
          end

          def issue_join_token(room_name:, participant:, expires_at:, owner:, allow_screen_share:)
            ttl = (expires_at - Time.current).floor
            raise Rejected, "The Twilio access-token lifetime is invalid." unless ttl.between?(1, 86_400)

            token = ::Twilio::JWT::AccessToken.new(Config.twilio_account_sid, Config.twilio_api_key_sid,
              Config.twilio_api_key_secret, [], identity: participant.provider_subject_id.to_s, ttl: ttl)
            token.add_grant(::Twilio::JWT::AccessToken::VideoGrant.new(room: room_name))
            token.to_jwt
          rescue ArgumentError, ::JWT::EncodeError
            raise Rejected, "Twilio could not issue the room access token."
          end

          def end_room(name:)
            response = request(:post, "Rooms/#{escape(name)}", form: { "Status" => "completed" })
            validate_room!(response, expected_name: name)
            raise Unavailable, "Twilio did not confirm the room completion request." unless response["status"] == "completed"
            response
          end

          def extend_room(name:, expires_at:)
            room = get_room(name: name)
            raise Rejected, "The Twilio room has already ended." if room["status"] == "completed"
            raise Rejected, "The requested application access window is invalid." unless expires_at.future?

            { "status" => room.fetch("status"), "extension_scope" => "application_access" }
          end

          def eject_participant(name:, provider_session_ref:)
            response = request(:post, "Rooms/#{escape(name)}/Participants/#{escape_sid(provider_session_ref, "PA")}",
              form: { "Status" => "disconnected" })
            unless response.is_a?(Hash) && response["account_sid"] == Config.twilio_account_sid &&
                response["sid"] == provider_session_ref && response["status"] == "disconnected"
              raise Unavailable, "Twilio did not confirm participant disconnection."
            end
            response
          end

          def delete_room(name:)
            end_room(name: name)
          end

          def health
            response = request(:get, "Rooms?PageSize=1")
            raise Unavailable, "The Twilio Video response is unavailable." unless response["rooms"].is_a?(Array)
            { status: "ready" }
          end

          def verify_event(url:, params:, signature:)
            secret = Config.twilio_auth_token
            raise Rejected, "The Twilio callback secret is unavailable." unless secret
            validator = ::Twilio::Security::RequestValidator.new(secret)
            raise Rejected, "The Twilio callback signature is invalid." unless validator.validate(
              url.to_s, params.to_h.transform_keys(&:to_s), signature.to_s
            )
            true
          end

          def normalize_event(payload)
            value = payload.to_h.stringify_keys
            event_type = {
              "room-created" => "meeting.created",
              "room-ended" => "meeting.ended",
              "participant-connected" => "participant.joined",
              "participant-disconnected" => "participant.left"
            }.fetch(value.fetch("StatusCallbackEvent"))
            occurred_at = Time.iso8601(value.fetch("Timestamp"))
            identity = value["ParticipantIdentity"].to_s.presence
            session_ref = value["ParticipantSid"].to_s.presence
            event_key = [ value.fetch("AccountSid"), value.fetch("RoomSid"), event_type,
              session_ref, value["SequenceNumber"], occurred_at.iso8601(6) ].join("\0")
            {
              provider_account_ref: value.fetch("AccountSid").to_s,
              provider_event_id: Digest::SHA256.hexdigest(event_key),
              event_type: event_type,
              room_name: value.fetch("RoomName").to_s.first(128),
              provider_subject_id: identity,
              provider_session_ref: session_ref&.first(160),
              occurred_at: occurred_at,
              metadata: {
                "room_sid" => value.fetch("RoomSid").to_s.first(64),
                "room_status" => value["RoomStatus"].to_s.first(24).presence,
                "participant_status" => value["ParticipantStatus"].to_s.first(24).presence,
                "sequence_number" => value["SequenceNumber"].to_s.first(32).presence,
                "duration_seconds" => (value["ParticipantDuration"] || value["RoomDuration"])
              }.compact
            }
          rescue KeyError, ArgumentError, TypeError
            raise Rejected, "The Twilio callback payload is unsupported."
          end

          private

          def request(method, path, form: nil)
            key_sid = Config.twilio_api_key_sid
            key_secret = Config.twilio_api_key_secret
            raise Unavailable, "The Twilio Video API credentials are unavailable." unless key_sid && key_secret
            uri = URI.join(API_BASE.to_s, path)
            request_class = { get: Net::HTTP::Get, post: Net::HTTP::Post }.fetch(method)
            http_request = request_class.new(uri)
            http_request.basic_auth(key_sid, key_secret)
            http_request.set_form_data(form) if form
            response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: OPEN_TIMEOUT,
              read_timeout: READ_TIMEOUT, write_timeout: READ_TIMEOUT) do |http|
              http.max_retries = 0 if http.respond_to?(:max_retries=)
              http.request(http_request)
            end
            parsed = response.body.present? ? JSON.parse(response.body) : {}
            return parsed if response.code.to_i.between?(200, 299)
            raise NotFound, "Twilio could not find the provider resource." if response.code.to_i == 404
            raise Rejected, "Twilio rejected the provider request (HTTP #{response.code})." if response.code.to_i.between?(400, 499)
            raise Unavailable, "Twilio Video is temporarily unavailable."
          rescue JSON::ParserError, Net::OpenTimeout, Net::ReadTimeout, IOError, SystemCallError, OpenSSL::SSL::SSLError
            raise Unavailable, "The Twilio Video provider outcome is unavailable."
          end

          def validate_room!(room, expected_name:)
            raise Unavailable, "The Twilio room response is unavailable." unless room.is_a?(Hash)
            expected_matches = expected_name.to_s.start_with?("RM") ? room["sid"] == expected_name :
              room["unique_name"] == expected_name
            unless room["account_sid"] == Config.twilio_account_sid &&
                room["sid"].to_s.match?(/\ARM[0-9a-fA-F]{32}\z/) &&
                expected_matches && %w[in-progress completed].include?(room["status"])
              raise Unavailable, "The Twilio room response is unavailable."
            end
          end

          def escape(value)
            raise ArgumentError, "The provider room identifier is invalid." unless value.to_s.match?(/\A[A-Za-z0-9_-]{1,128}\z/)
            value.to_s
          end

          def escape_sid(value, prefix)
            raise ArgumentError, "The provider participant reference is invalid." unless value.to_s.match?(/\A#{prefix}[0-9a-fA-F]{32}\z/)
            value.to_s
          end
        end
      end
    end
  end
end
