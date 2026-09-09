module Clinic
  module PatientPortal
    class AccountPasswordController < BaseController
      rate_limit to: 10, within: 15.minutes, only: :update, name: "patient_portal_password_change_ip",
        with: -> { render json: { error: "Too many password attempts. Please try again later." }, status: :too_many_requests }

      def update
        input = parameter_hash!(:patient_portal_password,
          %i[current_password password password_confirmation])
        current_password = password_value!(input[:current_password], :current_password, minimum: 1)
        password = password_value!(input[:password], :password, minimum: 12)
        password_confirmation = password_value!(input[:password_confirmation], :password_confirmation, minimum: 12)
        ChangePassword.call(identity: patient_portal_identity, current_password:, password:, password_confirmation:,
          session:)
        render json: { changed: true }
      rescue ChangePassword::InvalidCurrentPassword
        render json: { error: "The current password is incorrect.", code: "invalid_current_password" },
          status: :unprocessable_entity
      rescue ChangePassword::InvalidPassword => error
        render json: { error: error.message, code: "invalid_password" }, status: :unprocessable_entity
      end

      private

      def password_value!(value, field, minimum:)
        password = value.to_s
        unless password.length.between?(minimum, 72)
          raise Clinic::Api::RequestParameters::Invalid.new(
            "#{field} must be between #{minimum} and 72 characters.", field: field
          )
        end
        password
      end
    end
  end
end
