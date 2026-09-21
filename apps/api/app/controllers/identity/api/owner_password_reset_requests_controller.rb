module Identity
  module Api
    class OwnerPasswordResetRequestsController < ApplicationController
      include Clinic::Api::RequestParameters

      rate_limit to: 5, within: 15.minutes, only: :create, name: "owner_password_reset_request_ip",
        with: -> { render json: { error: "Too many reset requests. Please try again later." }, status: :too_many_requests }

      def create
        input = parameter_hash!(:owner_password_reset_request, %i[email_address])
        email_address = input[:email_address].to_s.strip.downcase.first(254)
        render json: Platform::RequestOwnerPasswordReset.call(email_address:), status: :accepted
      end
    end
  end
end
