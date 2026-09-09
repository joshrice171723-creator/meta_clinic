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
        identity = Identity.joins(:user).find_by(users: { email_address: contact })
        recovery_path = nil

        if identity&.active? && identity.user.active?
          result = InviteIdentity.call(
            practice: identity.practice,
            patient: identity.patient,
            actor: identity.user,
            email_address: contact,
          )
          # Local previews have no configured mail delivery. Keeping the token
          # out of production responses prevents account enumeration there.
          if DevelopmentAccess.allowed?(request)
            recovery_path = "/patient-portal/activate#token=#{ERB::Util.url_encode(result.fetch(:token))}&purpose=recovery"
          end
        end

        render json: {
          accepted: true,
          message: "If a matching portal account exists, a secure recovery link is being prepared.",
          recovery_path: recovery_path
        }, status: :accepted
      rescue ArgumentError, ActiveRecord::RecordInvalid
        render json: {
          accepted: true,
          message: "If a matching portal account exists, a secure recovery link is being prepared.",
          recovery_path: nil
        }, status: :accepted
      end

      private

      def require_synthetic_portal
        head :not_found unless Rails.env.test? || DevelopmentAccess.allowed?(request)
      end
    end
  end
end
