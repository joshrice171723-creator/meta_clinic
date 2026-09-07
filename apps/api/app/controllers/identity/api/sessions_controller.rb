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
          environment: runtime_environment,
          development_accounts: development_accounts,
          business_date: Current.business_date.iso8601,
          clinic_available: !Rails.env.production? || Staging::DemoClinic.available_to?(current_user) }
      end

      def show
        render json: { user: session_user(current_user) }
      end

      def create
        user = authenticated_member
        return invalid_credentials unless user

        establish_session(user)
        render json: { user: user.as_json(only: %i[id email_address admin]) }
      end

      def development
        return head :not_found unless DevelopmentAccess.allowed?(request)

        business_date = session[:development_business_date]
        profile = params[:profile]
        named_profile = params.key?(:profile)
        if named_profile
          user = profile.is_a?(String) && Development::TestAccounts.sign_in_account(profile)
          return render json: { error: "This account is unavailable. It may be disabled or need local setup." }, status: :unauthorized unless user
        else
          user = Development::DemoAccount.create!
        end
        establish_session(user)
        session[:development_business_date] = business_date if business_date.present?
        session[:development_demo_user_id] = user.id
        session[:development_test_profile] = profile.to_s if named_profile
        preview = Development::TestAccounts.preview_account_for(user, profile: profile)
        render json: {
          user: session_user(user),
          destination: preview&.fetch(:destination, nil) || "/portal"
        }, status: :created
      end

      def destroy
        current_member_session&.destroy!
        reset_session
        head :no_content
      end

      def development_date
        return head :not_found unless DevelopmentAccess.allowed?(request)

        value = params[:date].to_s
        if value.present?
          date = Date.iso8601(value)
          unless (Date.new(2000, 1, 1)..Date.new(2100, 12, 31)).cover?(date)
            return render json: { error: "Choose a date between 2000 and 2100." }, status: :unprocessable_entity
          end
          session[:development_business_date] = date.iso8601
        else
          session.delete(:development_business_date)
          date = Date.current
        end
        Current.business_date = date
        render json: { business_date: date.iso8601 }
      rescue Date::Error
        render json: { error: "Choose a valid date." }, status: :unprocessable_entity
      end

      private

      def session_user(user)
        demo = development_demo?
        preview = Development::TestAccounts.preview_account_for(user,
          profile: session[:development_test_profile]) if demo
        user.as_json(only: %i[id email_address admin]).merge(
          development_demo: !!demo,
          development_account_id: preview&.fetch(:id, nil)
        )
      end

      def development_accounts
        DevelopmentAccess.allowed?(request) ? Development::TestAccounts.preview_accounts : []
      end

      def runtime_environment
        deployment = ENV["APP_DEPLOYMENT_ENV"].to_s.downcase
        return "test" if Rails.env.test? || deployment == "staging"
        return "production" if Rails.env.production? || deployment == "production"

        "development"
      end

      def invalid_credentials
        render json: { error: "Email or password is incorrect." }, status: :unauthorized
      end
    end
  end
end
