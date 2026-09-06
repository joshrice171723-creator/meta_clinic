module Clinic
  module Billing
    class StripeConnectController < Clinic::BaseController
      before_action -> { head :not_found unless Rails.env.test? || DevelopmentAccess.allowed?(request) }
      before_action -> { require_capability("billing.read") }
      rescue_from StripeGateway::Unavailable do |error|
        render json: { error: error.message }, status: :service_unavailable
      end
      rescue_from StripeGateway::Invalid, ArgumentError do |error|
        render json: { error: error.message }, status: :unprocessable_entity
      end

      def show
        ability = Ability.new(current_user, practice: current_practice)
        can_manage = ability.allowed_permission?("subscription_catalog.publish") &&
          (ability.allowed_permission?("billing.payment_record") || ability.allowed_permission?("billing.write"))
        render json: StripeConnect.status(current_practice).merge(can_manage: can_manage)
      end

      def onboard
        render json: { url: StripeConnect.onboard(practice: current_practice, actor: current_user) }
      end

      def refresh
        render json: StripeConnect.refresh(practice: current_practice, actor: current_user)
      end
    end
  end
end
