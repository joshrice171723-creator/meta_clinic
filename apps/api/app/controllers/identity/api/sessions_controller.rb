module Identity
  module Api
    class SessionsController < ApplicationController
      include MemberAuthentication
      DEVELOPMENT_PORTALS = {
        "owner" => { account_types: [ "omni" ], destination: "/owner" },
        "launch" => { account_types: [ "omni" ], destination: "/portal" },
        "patient" => { account_types: [ "patient" ], destination: "/patient-portal" },
        "clinic" => { account_types: [ "employee", "omni" ], destination: "/clinic" }
      }.freeze
      before_action :require_member, only: %i[show update]
      before_action :enforce_login_rate_limit, only: %i[create development]

      def csrf
        render json: { csrf_token: form_authenticity_token,
          development_login: DevelopmentAccess.allowed?(request),
          environment: runtime_environment,
          development_accounts: development_accounts,
          business_date: Current.business_date.iso8601,
          clinic_available: Clinic::DeploymentAccess.available_to?(current_user) }
      end

      def show
        render json: { user: session_user(current_user), session_policy: session_policy, clinic_access: clinic_access }
      end

      def update
        unless current_member_session.record_activity!
          return render json: { error: "Your session expired. Please sign in again." }, status: :unauthorized
        end

        render json: { user: session_user(current_user), session_policy: session_policy, clinic_access: clinic_access }
      end

      def create
        user = authenticated_member
        return invalid_credentials unless user

        establish_session(user)
        enrollment = Clinic::MembershipProspect.find_by(account_user_id: user.id, intent_type: "purchase")
        destination = "/memberships/account" if enrollment && Clinic::DeploymentAccess.practice_enabled?(enrollment.practice_id)
        render json: { user: user.as_json(only: %i[id email_address admin platform_owner]), destination: }
      end

      def development
        return head :not_found unless DevelopmentAccess.allowed?(request)

        business_date = session[:development_business_date]
        profile = params[:profile]
        default_user = Development::DemoAccount.create! unless params.key?(:profile)
        profile = "employee-#{default_user.id}" if default_user
        user = profile.is_a?(String) && Development::TestAccounts.sign_in_account(profile)
        return render json: { error: "This account is unavailable. It may be disabled or need local setup." }, status: :unauthorized unless user

        preview = Development::TestAccounts.preview_account_for(user, profile: profile)
        portal = params[:portal].presence
        portal_definition = DEVELOPMENT_PORTALS[portal] if portal
        if portal && (!portal_definition || !portal_definition.fetch(:account_types).include?(preview&.fetch(:account_type)))
          return render json: { error: "The selected account cannot enter that portal." }, status: :unprocessable_entity
        end
        site_id = params[:site_id].presence || preview&.fetch(:locations, [])&.one? && preview.fetch(:locations).first.fetch(:id).to_s
        if portal == "clinic" && !valid_development_clinic_scope?(preview, site_id: site_id)
          return render json: { error: "Choose an authorized organization, clinic, and location." }, status: :unprocessable_entity
        end

        establish_session(user)
        session[:development_business_date] = business_date if business_date.present?
        session[:development_demo_user_id] = user.id
        session[:development_test_profile] = profile
        session[:clinic_site_id] = site_id if portal == "clinic"
        render json: {
          user: session_user(user),
          destination: portal_definition&.fetch(:destination) || preview&.fetch(:destination, nil) || "/portal"
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

      def session_policy
        record = current_member_session
        { idle_expires_at: record.idle_expires_at.iso8601(6),
          absolute_expires_at: [record.expires_at, record.created_at + MemberSession::MAX_DURATION].min.iso8601(6),
          idle_timeout_seconds: MemberSession::IDLE_DURATION.to_i, server_time: Time.current.iso8601(6) }
      end

      def clinic_access
        membership = if session[:clinic_membership_id].present?
          current_user.clinic_memberships.find_by(id: session[:clinic_membership_id])
        else
          current_user.clinic_membership
        end
        return nil unless membership

        { membership_id: membership.id, practice_id: membership.practice_id, active: membership.active?,
          authorization_generation: membership.authorization_generation }
      end

      def enforce_login_rate_limit
        limited = Identity::LoginThrottle.exceeded?(scope: "ip", value: request.remote_ip, limit: 50)
        if action_name == "create"
          limited = Identity::LoginThrottle.exceeded?(scope: "email", value: params[:email_address].to_s.strip.downcase, limit: 10) || limited
        end
        return unless limited

        response.set_header("Retry-After", Identity::LoginThrottle::WINDOW_SECONDS.to_s)
        render json: { error: "Too many sign-in attempts. Please try again in five minutes." }, status: :too_many_requests
      rescue ActiveRecord::ActiveRecordError
        render json: { error: "Sign-in is temporarily unavailable. Please try again.", code: "sign_in_unavailable" }, status: :service_unavailable
      end

      def session_user(user)
        demo = development_demo?
        preview = Development::TestAccounts.preview_account_for(user,
          profile: session[:development_test_profile]) if demo
        user.as_json(only: %i[id email_address admin platform_owner]).merge(
          development_demo: !!demo,
          development_account_id: preview&.fetch(:id, nil)
        )
      end

      def development_accounts
        DevelopmentAccess.allowed?(request) ? Development::TestAccounts.preview_accounts : []
      end

      def valid_development_clinic_scope?(preview, site_id: params[:site_id].presence)
        return true unless params[:practice_id].present? || site_id.present?

        clinic = preview&.fetch(:clinic, nil)
        locations = preview&.fetch(:locations, []) || []
        return true unless clinic

        params[:practice_id].to_s == clinic.fetch(:id).to_s &&
          (locations.empty? || locations.any? { |site| site.fetch(:id).to_s == site_id.to_s })
      end

      def runtime_environment
        deployment = ENV["APP_DEPLOYMENT_ENV"].to_s.downcase
        return "test" if Rails.env.test? || deployment == "staging"
        return "production" if Rails.env.production? || deployment == "production"

        "development"
      end

      def invalid_credentials
        Identity::SessionAudit.record!(action: "sign_in.failed", outcome: "denied")
        render json: { error: "Email or password is incorrect." }, status: :unauthorized
      end
    end
  end
end
