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
        if params[:kind].present?
          render json: PatientLedger.history_page(
            practice: current_practice,
            patient: patient,
            kind: params[:kind].to_s,
            before: optional_id(params[:before], :before),
            include_adjustment_evidence: true
          )
        else
          focus = %i[invoice_id payment_id refund_id encounter_id].to_h do |field|
            [field, optional_id(params[field], field)]
          end.compact
          render json: PatientLedger.call(
            practice: current_practice,
            patient: patient,
            include_adjustment_evidence: true,
            history_limit: PatientLedger::HISTORY_LIMIT,
            focus: focus
          )
        end
      end
    end
  end
end
