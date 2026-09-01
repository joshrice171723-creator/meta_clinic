module Identity
  module Api
    class SessionsController < ApplicationController
      include MemberAuthentication
      before_action :require_member, only: :show
      rate_limit to: 10, within: 5.minutes, only: :create, name: "email",
        by: -> { Digest::SHA256.hexdigest(params[:email_address].to_s.strip.downcase) },
        with: -> { render json: { error: "Too many sign-in attempts. Please try again in five minutes." }, status: :too_many_requests }
      rate_limit to: 50, within: 5.minutes, only: %i[create development], name: "ip",
        with: -> { render json: { error: "Too many sign-in attempts. Please try again in five minutes." }, status: :too_many_requests }

      def csrf
        render json: { csrf_token: form_authenticity_token,
          development_login: DevelopmentAccess.allowed?(request),
          clinic_available: !Rails.env.production? || Staging::DemoClinic.available_to?(current_user) }
      end

      def show
        render json: { user: current_user.as_json(only: %i[id email_address admin]).merge(development_demo: !!development_demo?) }
      end

      def create
        user = authenticated_member
        return invalid_credentials unless user

        establish_session(user)
        render json: { user: user.as_json(only: %i[id email_address admin]) }
      end

      def development
        return head :not_found unless DevelopmentAccess.allowed?(request)

        profile = params[:profile]
        named_profile = params.key?(:profile)
        if named_profile
          user = profile.is_a?(String) && Development::TestAccounts.sign_in_account(profile)
          return render json: { error: "This test login is unavailable. It may be disabled or need local setup." }, status: :unauthorized unless user
        else
          user = Development::DemoAccount.create!
        end
        establish_session(user)
        session[:development_demo_user_id] = user.id
        session[:development_test_profile] = profile.to_s if named_profile
        render json: { development_demo: true }, status: :created
      end

      def destroy
        current_member_session&.destroy!
        reset_session
        head :no_content
      end

      private

      def invalid_credentials
        render json: { error: "Email or password is incorrect." }, status: :unauthorized
      end
    end
  end
end
