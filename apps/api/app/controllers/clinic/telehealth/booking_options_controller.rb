module Clinic
  module Telehealth
    class BookingOptionsController < BaseController
      def show
        unless current_ability.allowed_permission?("appointments.book", any_site: true) ||
            current_ability.allowed_permission?("appointments.read", any_site: true)
          raise Clinic::Authorization::Denied
        end
        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id)) if params[:site_id].present?
        if site && !current_ability.allowed_permission?("appointments.book", site: site) &&
            !current_ability.allowed_permission?("appointments.read", site: site)
          raise Clinic::Authorization::Denied
        end
        setting = Setting.find_by(practice_id: current_practice.id)
        rules = VisitTypeRule.where(practice_id: current_practice.id).order(:visit_type_id, :site_id)
        rules = rules.where(site_id: [ nil, site.id ]) if site
        rules = rules.to_a
        available_ids = site ? Configuration::StarterProfile.available_visit_type_ids(practice: current_practice, site: site) : []
        location_ready = site && Configuration::StarterProfile.service_available?(practice: current_practice, site: site, service: "telehealth")
        enabled = Config.configured_for?(setting) && setting&.enabled? && setting.active_policy_version&.published? &&
          setting.health_status == "ready" && location_ready
        projected_rules = rules.map do |rule|
          overridden = rule.site_id.nil? && rules.any? { |specific| specific.site_id == site&.id && specific.site_id && specific.visit_type_id == rule.visit_type_id }
          { visit_type_id: rule.visit_type_id, site_id: rule.site_id,
            enabled: !!(enabled && rule.enabled? && available_ids.include?(rule.visit_type_id) && !overridden) }
        end
        enabled = !!enabled && projected_rules.any? { |rule| rule[:enabled] }
        render json: envelope({ enabled: enabled, allowed_modalities: enabled ? %w[in_person video] : %w[in_person],
          visit_type_rules: projected_rules }, version: setting&.lock_version.to_i,
          allowed_actions: %w[appointments.book])
      end
    end
  end
end
