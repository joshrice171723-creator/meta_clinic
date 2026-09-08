module Clinic
  module Telehealth
    class SettingsController < BaseController
      def show
        result = SettingsDetail.call(practice: current_practice, actor: current_user)
        setting = result[:setting]
        render json: envelope(SettingsSerializer.call(result), version: setting&.lock_version.to_i,
          allowed_actions: %w[telehealth.configure telehealth.check_connection telehealth.disable])
      end

      def draft
        input = params.permit(:request_key, :expected_version, settings: [ :provider_account_ref, :enabled ],
          policy: SaveSettingsDraft::POLICY_FIELDS, visit_type_rules: [ :visit_type_id, :site_id, :enabled,
            :min_patient_age_years, :max_patient_age_years, { allowed_region_codes: [] } ]).to_h.deep_symbolize_keys
        setting = SaveSettingsDraft.call(practice: current_practice, actor: current_user,
          request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version),
          settings: input.fetch(:settings), policy: input.fetch(:policy), visit_type_rules: input.fetch(:visit_type_rules, []))
        render_settings(setting)
      end

      def publish
        input = params.permit(:request_key, :expected_version, :draft_version).to_h.symbolize_keys
        PublishSettings.call(practice: current_practice, actor: current_user, request_key: input.fetch(:request_key),
          expected_version: input.fetch(:expected_version), draft_version: input.fetch(:draft_version))
        render_settings(Setting.find_by!(practice_id: current_practice.id))
      end

      def check_connection
        input = params.permit(:request_key).to_h.symbolize_keys
        setting = CheckProviderHealth.call(practice: current_practice, actor: current_user,
          request_key: input.fetch(:request_key))
        render_settings(setting)
      end

      def disable
        input = params.permit(:request_key, :expected_version).to_h.symbolize_keys
        setting = DisableNewVisits.call(practice: current_practice, actor: current_user,
          request_key: input.fetch(:request_key), expected_version: input.fetch(:expected_version))
        render_settings(setting)
      end

      private

      def render_settings(setting)
        result = SettingsDetail.call(practice: current_practice, actor: current_user)
        render json: envelope(SettingsSerializer.call(result), version: setting.reload.lock_version,
          allowed_actions: %w[telehealth.configure telehealth.check_connection telehealth.disable])
      end
    end
  end
end
