module Clinic
  module PatientPortal
    class ActivationController < ApplicationController
      include Clinic::Api::RequestParameters
      rate_limit to: 10, within: 15.minutes, only: :create, name: "patient_portal_activation_ip",
        with: -> { render json: { error: "Too many activation attempts. Please try again later." }, status: :too_many_requests }

      def create
        input = parameter_hash!(:patient_portal_activation,
          %i[token password password_confirmation accepted_terms terms_version])
        token = required_string!(input[:token], field: :token, maximum: 200)
        password = password_value!(input[:password], :password)
        password_confirmation = password_value!(input[:password_confirmation], :password_confirmation)
        terms_version = required_string!(input[:terms_version], field: :terms_version, maximum: 80)
        accepted_terms = boolean_param(input[:accepted_terms], field: :accepted_terms)
        ActivateIdentity.call(token:, password:, password_confirmation:, accepted_terms:, terms_version:, session:)
        render json: { activated: true, redirect_to: "/patient-portal" }, status: :created
      rescue ActivateIdentity::InvalidInvitation
        render json: { error: "That invitation is invalid or has expired.", code: "invalid_invitation" }, status: :unprocessable_entity
      rescue ActivateIdentity::InvalidPassword => error
        render json: { error: error.message, code: "invalid_password" }, status: :unprocessable_entity
      rescue Clinic::Api::RequestParameters::Invalid => error
        render json: { error: error.message, code: "invalid_request", field: error.field }, status: :bad_request
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
