module Clinic
  module PatientPortal
    class ActivationController < ApplicationController
      include Clinic::Api::RequestParameters
      rate_limit to: 10, within: 15.minutes, only: :create, name: "patient_portal_activation_ip",
        with: -> { render json: { error: "Too many activation attempts. Please try again later." }, status: :too_many_requests }

      def create
        input = parameter_hash!(:patient_portal_activation, %i[token accepted_terms terms_version])
        token = required_string!(input[:token], field: :token, maximum: 200)
        terms_version = required_string!(input[:terms_version], field: :terms_version, maximum: 80)
        accepted_terms = boolean_param(input[:accepted_terms], field: :accepted_terms)
        ActivateIdentity.call(token:, accepted_terms:, terms_version:, session:)
        render json: { activated: true, redirect_to: "/patient-portal" }, status: :created
      rescue ActivateIdentity::InvalidInvitation
        render json: { error: "That invitation is invalid or has expired.", code: "invalid_invitation" }, status: :unprocessable_entity
      end
    end
  end
end
