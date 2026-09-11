module Identity
  module Api
    class OwnerActivationsController < ApplicationController
      include Clinic::Api::RequestParameters
      include MemberAuthentication

      rate_limit to: 10, within: 15.minutes, only: :create, name: "owner_activation_ip",
        with: -> { render json: { error: "Too many activation attempts. Please try again later." }, status: :too_many_requests }

      def create
        input = parameter_hash!(:owner_activation, %i[token password password_confirmation])
        token = required_string!(input[:token], field: :token, maximum: 200)
        password = password_value!(input[:password], :password)
        confirmation = password_value!(input[:password_confirmation], :password_confirmation)
        result = Platform::ActivateOwner.call(
          token:, password:, password_confirmation: confirmation
        )
        establish_session(result.fetch(:user))
        render json: { activated: true, redirect_to: "/owner" }, status: :created
      rescue Platform::ActivateOwner::InvalidInvitation
        render json: { error: "That owner invitation is invalid or has expired.", code: "invalid_invitation" },
          status: :unprocessable_entity
      rescue Platform::ActivateOwner::InvalidPassword => error
        render json: { error: error.message, code: "invalid_password" }, status: :unprocessable_entity
      end

      private

      def password_value!(value, field)
        password = value.to_s
        unless password.length.between?(12, 72)
          raise Clinic::Api::RequestParameters::Invalid.new(
            "#{field} must be between 12 and 72 characters.", field: field
          )
        end
        password
      end
    end
  end
end
