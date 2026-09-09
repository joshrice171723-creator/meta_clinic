module Clinic
  module PatientPortal
    class RecoveryController < ApplicationController
      include Clinic::Api::RequestParameters
      before_action :require_synthetic_portal
      rate_limit to: 5, within: 15.minutes, only: :create,
        name: "patient_portal_recovery_ip",
        with: -> { render json: { error: "Too many recovery requests. Please try again later." }, status: :too_many_requests }

      def create
        input = parameter_hash!(:patient_portal_recovery, %i[contact])
        contact = required_string!(input[:contact], field: :contact, maximum: 254).downcase
        result = RequestRecovery.call(contact: contact, preview: DevelopmentAccess.allowed?(request))
        render json: result, status: :accepted
      end

      private

      def require_synthetic_portal
        head :not_found unless Rails.env.test? || DevelopmentAccess.allowed?(request)
      end
    end
  end
end
