module Clinic
  module PatientPortal
    class ActivationController < ApplicationController
      include Clinic::Api::RequestParameters
      before_action :require_synthetic_portal

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

      private

      def require_synthetic_portal
        head :not_found unless Rails.env.test? || DevelopmentAccess.allowed?(request)
      end
    end
  end
end
