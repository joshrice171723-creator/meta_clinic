module Clinic
  module Telehealth
    class BookingOptionsController < BaseController
      def show
        unless current_ability.allowed_permission?("appointments.book", any_site: true) ||
            current_ability.allowed_permission?("appointments.read", any_site: true)
          raise Clinic::Authorization::Denied
        end
        setting = Setting.find_by(practice_id: current_practice.id)
        rules = VisitTypeRule.where(practice_id: current_practice.id).order(:visit_type_id, :site_id)
        enabled = Config.configured_for?(setting) && setting&.enabled? && setting.active_policy_version&.published? &&
          setting.health_status == "ready"
        render json: envelope({ enabled: enabled, allowed_modalities: enabled ? %w[in_person video] : %w[in_person],
          visit_type_rules: rules.map { |rule| { visit_type_id: rule.visit_type_id, site_id: rule.site_id,
            enabled: enabled && rule.enabled? } } }, version: setting&.lock_version.to_i,
          allowed_actions: %w[appointments.book])
      end
    end
  end
end
