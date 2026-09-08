module Clinic
  module Telehealth
    module SubmitCheckin
      DEVICE_VALUES = %w[passed failed not_available not_checked].freeze
      BROWSER_VALUES = %w[supported unsupported unknown].freeze
      module_function

      def call(visit:, identity:, request_key:, expected_version:, checkin:)
        PatientIdempotency.validate_context!(identity, visit)
        normalized = normalize(checkin, visit.policy_version)
        outcome = PatientIdempotency.execute(identity: identity, visit: visit, operation_code: "telehealth.submit_checkin",
          request_key: request_key, payload: { expected_version: expected_version, checkin: normalized }, result_kind: "checkin") do
          visit.with_lock do
            raise ActiveRecord::StaleObjectError.new(visit, "update") unless visit.lock_version == expected_version.to_i
            raise Error.new("This video visit no longer accepts preparation.", code: "visit_not_preparable", status: :conflict) if
              visit.status.in?(%w[ending ended cancelled no_show])
            participant = visit.participants.find_or_create_by!(portal_identity_id: identity.id) do |row|
              row.practice_id = visit.practice_id
              row.role = "patient"
              row.status = "eligible"
            end
            prior = visit.checkins.order(sequence: :desc).first
            visit.checkins.create!(practice_id: visit.practice_id, participant_id: participant.id,
              sequence: prior&.sequence.to_i + 1, access_generation: visit.access_generation,
              location_payload: normalized[:location] && JSON.generate(normalized[:location]),
              callback_phone: normalized[:callback_phone], location_attested: normalized[:location_attested],
              device_results: normalized[:device_results], submitted_at: Time.current, supersedes_checkin_id: prior&.id)
          end
        end
        outcome.value
      end

      def normalize(input, policy)
        value = input.respond_to?(:to_h) ? input.to_h.deep_symbolize_keys : {}
        location = value[:location].respond_to?(:to_h) ? value[:location].to_h.deep_symbolize_keys : nil
        if policy.require_location?
          required = %i[address_line1 city region_code postal_code country_code]
          raise Error.new("Current visit location is required.", code: "location_required", field: "location") unless
            location && required.all? { |field| location[field].to_s.strip.present? }
          raise Error.new("Confirm the location used for this visit.", code: "location_attestation_required",
            field: "location_attested") unless ActiveModel::Type::Boolean.new.cast(value[:location_attested])
        end
        if location
          location = location.slice(:address_line1, :unit, :city, :region_code, :postal_code, :country_code)
            .transform_values { |entry| entry.to_s.strip.first(200) }
          location[:region_code] = location[:region_code].upcase
          location[:country_code] = location[:country_code].upcase
        end
        phone = value[:callback_phone].to_s.strip.presence
        raise Error.new("A callback phone number is required.", code: "callback_required", field: "callback_phone") if
          policy.require_callback? && phone.nil?
        devices = value[:device_results].respond_to?(:to_h) ? value[:device_results].to_h.deep_symbolize_keys : {}
        %i[camera microphone speaker].each do |field|
          raise Error.new("The #{field} result is invalid.", code: "invalid_device_result", field: "device_results.#{field}") unless
            DEVICE_VALUES.include?(devices[field].to_s)
        end
        raise Error.new("The browser result is invalid.", code: "invalid_device_result", field: "device_results.browser") unless
          BROWSER_VALUES.include?(devices[:browser].to_s)
        checked_at = Time.iso8601(devices[:checked_at].to_s)
        audio_only = ActiveModel::Type::Boolean.new.cast(devices[:audio_only_requested])
        if audio_only && !policy.allow_audio_only?
          raise Error.new("Audio-only participation is not enabled for this visit.", code: "audio_only_not_allowed")
        end
        { location: location, callback_phone: phone,
          location_attested: ActiveModel::Type::Boolean.new.cast(value[:location_attested]),
          device_results: { camera: devices[:camera].to_s, microphone: devices[:microphone].to_s,
            speaker: devices[:speaker].to_s, browser: devices[:browser].to_s, audio_only_requested: audio_only,
            checked_at: checked_at.utc.iso8601(6) } }
      rescue ArgumentError
        raise Error.new("The device check timestamp is invalid.", code: "invalid_device_result", field: "device_results.checked_at")
      end
    end
  end
end
