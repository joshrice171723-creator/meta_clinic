module Clinic
  module Billing
    class PatientLedgersController < Clinic::ApiController
      content_security_policy only: :statement do |policy|
        request.content_security_policy_nonce_generator = ->(_request) { SecureRandom.base64(32) }
        request.content_security_policy_nonce_directives = %w[script-src style-src]
        policy.script_src :self
        policy.style_src :self
        policy.frame_ancestors :self
      end

      before_action -> { require_capability_with_legacy("billing.read", "billing.write") }

      def statement
        patient = current_practice.patients.find(requested_id!(params[:id], :id))
        @practice = current_practice
        @ledger = PatientLedger.call(practice: @practice, patient: patient)
        @issued_at = Current.business_time.in_time_zone(@practice.timezone)
        response.headers["Cache-Control"] = "no-store"
        render :statement, formats: [:html], layout: false
      end

      def show
        patient = current_practice.patients.find(requested_id!(params[:id], :id))
        render json: PatientLedger.call(
          practice: current_practice,
          patient: patient,
          include_adjustment_evidence: true
        )
      end
    end
  end
end
