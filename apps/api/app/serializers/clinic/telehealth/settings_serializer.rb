module Clinic
  module Telehealth
    module SettingsSerializer
      module_function

      def call(result)
        setting = result.fetch(:setting)
        {
          enabled: setting&.enabled? || false,
          provider_code: setting&.provider_code || Config.provider,
          provider_account_ref: setting&.provider_account_ref,
          health_status: health_status(setting),
          health_checked_at: setting&.health_checked_at&.iso8601(6),
          last_error_code: setting&.last_error_code,
          draft: policy(result[:draft]) || editable_copy(setting&.active_policy_version) || blank_draft,
          active_policy: policy(setting&.active_policy_version),
          visit_type_rules: result.fetch(:rules).map { |rule| rule_payload(rule) },
          options: options(result.fetch(:practice))
        }
      end

      def policy(value)
        return nil unless value
        value.attributes.symbolize_keys.slice(:version, :status, :consent_title, :consent_body, :content_digest, :locale,
          :patient_instructions, :support_label, :support_phone, :support_url, :join_early_minutes, :join_late_minutes,
          :max_room_minutes, :grant_ttl_seconds, :checkin_max_age_minutes, :allow_audio_only, :allow_staff_screen_share,
          :scribe_enabled, :require_location, :require_callback, :scribe_consent_title, :scribe_consent_body,
          :scribe_consent_digest, :lock_version).merge(published_at: value.published_at&.iso8601(6))
      end

      def rule_payload(rule)
        rule.attributes.symbolize_keys.slice(:visit_type_id, :site_id, :enabled, :allowed_region_codes,
          :min_patient_age_years, :max_patient_age_years, :lock_version).merge(
            visit_type_name: rule.visit_type.code
          )
      end

      def editable_copy(active_policy)
        return nil unless active_policy

        policy(active_policy).except(:content_digest, :scribe_consent_digest, :published_at, :lock_version).merge(
          version: active_policy.version + 1, status: "draft"
        )
      end

      def health_status(setting)
        return "disabled" unless Config.globally_enabled?
        return "not_configured" unless setting && Config.configured_for?(setting)
        return "configured" if setting.ready?
        return "degraded" if setting.degraded?
        "not_configured"
      end

      def blank_draft
        {
          version: 1, status: "draft", consent_title: "", consent_body: "", locale: "en-US",
          patient_instructions: "", support_label: "", support_phone: nil, support_url: nil,
          join_early_minutes: 15, join_late_minutes: 30, max_room_minutes: 120,
          grant_ttl_seconds: 120, checkin_max_age_minutes: 240, allow_audio_only: false,
          allow_staff_screen_share: false, scribe_enabled: false, require_location: true,
          require_callback: true, scribe_consent_title: nil, scribe_consent_body: nil,
          scribe_consent_digest: nil, lock_version: 0
        }
      end

      def options(practice)
        {
          visit_types: practice.visit_types.active.order(:code, :id).map do |visit_type|
            { id: visit_type.id, name: visit_type.code }
          end,
          sites: practice.sites.where(status: "active").order(:code, :id).map do |site|
            { id: site.id, name: site.name.presence || site.code }
          end
        }
      end
    end
  end
end
