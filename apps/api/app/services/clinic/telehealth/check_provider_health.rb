module Clinic
  module Telehealth
    module CheckProviderHealth
      module_function

      def call(practice:, actor:, request_key:)
        unless request_key.to_s.match?(Clinic::Idempotency::KEY_PATTERN)
          raise Error.new("A valid request key is required.", code: "invalid_request_key", status: :bad_request,
            field: "request_key")
        end
        membership = Clinic::Authorization.authorize!(actor: actor, practice: practice, action: "telehealth.configure", any_site: true)
        setting = Setting.find_by!(practice_id: practice.id)
        unless Config.configured_for?(setting)
          setting.update!(health_status: "unconfigured", health_checked_at: Time.current,
            last_error_code: "provider_unconfigured", updated_by_membership_id: membership.id)
          raise Error.new("The video provider configuration is incomplete.", code: "provider_unconfigured",
            status: :service_unavailable)
        end
        Providers.fetch(setting.provider_code).health
        setting.update!(health_status: "ready", health_checked_at: Time.current, last_error_code: nil,
          updated_by_membership_id: membership.id)
        setting
      rescue Providers::Unavailable, Providers::Rejected, Providers::Unsupported
        setting&.update!(health_status: "degraded", health_checked_at: Time.current,
          last_error_code: "provider_unavailable", updated_by_membership_id: membership&.id)
        raise Error.new("The video provider connection could not be verified.", code: "provider_unavailable",
          status: :service_unavailable, retryable: true)
      end
    end
  end
end
