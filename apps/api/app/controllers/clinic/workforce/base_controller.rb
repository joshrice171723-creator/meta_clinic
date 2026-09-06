module Clinic
  module Workforce
    class BaseController < Clinic::ApiController
      rescue_from Clinic::Workforce::EffectiveSettings::Unconfigured do |error|
        render json: { error: error.message, code: "workforce_settings_unconfigured" }, status: :unprocessable_entity
      end

      private

      def workforce_access
        @workforce_access ||= Clinic::Workforce::Access.new(actor: current_user, practice: current_practice)
      end
    end
  end
end
