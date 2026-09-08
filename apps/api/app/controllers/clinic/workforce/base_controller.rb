module Clinic
  module Workforce
    class BaseController < Clinic::ApiController
      rescue_from Clinic::Workforce::EffectiveSettings::Unconfigured do |error|
        render json: { error: error.message, code: "workforce_settings_unconfigured" }, status: :unprocessable_entity
      end

      private

      def sensitive_read_action
        return super unless request.get?

        case controller_path
        when "clinic/workforce/employments" then "workforce.admin"
        when "clinic/workforce/settings", "clinic/workforce/kiosks" then "workforce.settings"
        when "clinic/workforce/badges" then "workforce.badges"
        when "clinic/workforce/timecards", "clinic/workforce/adjustments" then "workforce.timecards.read"
        when "clinic/workforce/schedules" then "workforce.schedule.read"
        when "clinic/workforce/workforce_requests" then "workforce.requests.read"
        else super
        end
      end

      def workforce_access
        @workforce_access ||= Clinic::Workforce::Access.new(actor: current_user, practice: current_practice)
      end
    end
  end
end
