module Identity
  module Api
    class DevelopmentAccessController < ApplicationController
      before_action :require_development_access
      before_action :require_member

      def update
        return head :not_found unless development_omni?
        unless params[:expected_user_id].to_s == current_user.id.to_s
          return render json: { error: "Your signed-in account changed. Reload settings before switching views." }, status: :conflict
        end

        access = Development::OmniAccess.switch!(current_user, params[:profile])
        render json: { user_id: current_user.id, development_access: access }
      rescue ArgumentError => error
        render json: { error: error.message }, status: :unprocessable_entity
      rescue Development::TestAccounts::Unavailable => error
        render json: { error: error.message }, status: :conflict
      end

      private

      def require_development_access
        head :not_found unless DevelopmentAccess.allowed?(request)
      end
    end
  end
end
