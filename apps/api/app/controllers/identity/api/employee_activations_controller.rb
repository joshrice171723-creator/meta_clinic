module Identity
  module Api
    class EmployeeActivationsController < ApplicationController
      include Clinic::Api::RequestParameters
      include MemberAuthentication

      before_action :require_activation_available
      rate_limit to: 10, within: 15.minutes, only: :create, name: "employee_activation_ip",
        with: -> { render json: { error: "Too many activation attempts. Please try again later." }, status: :too_many_requests }

      def create
        input = parameter_hash!(:employee_activation, %i[token password password_confirmation])
        token = required_string!(input[:token], field: :token, maximum: 200)
        password = password_value!(input[:password], :password)
        confirmation = password_value!(input[:password_confirmation], :password_confirmation)
        result = Clinic::Workforce::EmployeeOnboarding.activate!(token: token, password: password,
          password_confirmation: confirmation)
        establish_session(result.fetch(:user))
        render json: {
          activated: true,
          redirect_to: "/clinic/workforce",
          employment: Clinic::Workforce::EmploymentSerializer.call(result.fetch(:employment))
        }, status: :created
      rescue Clinic::Workforce::EmployeeOnboarding::InvalidInvitation
        render json: { error: "That employee invitation is invalid or has expired.", code: "invalid_invitation" },
          status: :unprocessable_entity
      rescue Clinic::Workforce::EmployeeOnboarding::InvalidPassword => error
        render json: { error: error.message, code: "invalid_password" }, status: :unprocessable_entity
      end

      private

      def password_value!(value, field)
        password = value.to_s
        unless password.length.between?(12, 72)
          raise Clinic::Api::RequestParameters::Invalid.new("#{field} must be between 12 and 72 characters.", field: field)
        end
        password
      end

      def require_activation_available
        return unless Rails.env.production?

        digest = Clinic::Workforce::EmployeeInvitation.digest(params.dig(:employee_activation, :token))
        invitation = Clinic::Workforce::EmployeeInvitation.pending.find_by(token_digest: digest)
        head :not_found unless invitation && Clinic::DeploymentAccess.practice_enabled?(invitation.practice_id)
      end
    end
  end
end
