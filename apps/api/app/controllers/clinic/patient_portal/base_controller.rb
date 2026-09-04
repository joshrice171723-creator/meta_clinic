module Clinic
  module PatientPortal
    class BaseController < ApplicationController
      include Clinic::Api::RequestParameters
      before_action :require_member
      before_action :require_development_patient
      before_action :require_portal_identity

      rescue_from ActiveRecord::RecordInvalid do |error|
        render json: { error: error.record.errors.full_messages.to_sentence, code: "invalid_record" }, status: :unprocessable_entity
      end
      rescue_from ActiveRecord::RecordNotUnique do
        render json: { error: "That request conflicts with an existing record.", code: "already_exists" }, status: :conflict
      end
      rescue_from ActiveRecord::InvalidForeignKey do
        render json: { error: "The related record is not available in this practice.", code: "invalid_context" }, status: :unprocessable_entity
      end
      rescue_from Clinic::Api::RequestParameters::Invalid do |error|
        render json: { error: error.message, code: "invalid_request", field: error.field }, status: :bad_request
      end
      rescue_from ArgumentError do |error|
        render json: { error: error.message, code: "invalid_request" }, status: :unprocessable_entity
      end

      helper_method :patient_portal_identity, :portal_practice, :portal_patient

      private

      def require_development_patient
        return if Development::TestAccounts.patient?(current_user) || development_omni_preview?

        render json: { error: "The patient portal is available only for its assigned synthetic account." }, status: :not_found
      end

      def require_portal_identity
        return if patient_portal_identity || development_omni_preview_patient

        render json: { error: "No active patient portal access is assigned." }, status: :forbidden
      end

      def patient_portal_identity
        @patient_portal_identity ||= Clinic::PatientPortal::Identity.available
          .includes(:practice, :patient).find_by(user_id: current_user.id)
      end

      def portal_practice
        patient_portal_identity&.practice || development_omni_practice
      end

      def portal_patient
        patient_portal_identity&.patient || development_omni_preview_patient
      end

      def development_omni_preview?
        (Rails.env.test? || DevelopmentAccess.allowed?(request)) &&
          Development::TestAccounts.omni?(current_user)
      end

      def development_omni_practice
        Clinic::Membership.active.find_by(user_id: current_user.id)&.practice
      end

      def development_omni_preview_patients
        development_omni_practice&.patients&.where("reference LIKE ?", "SYN-OMNI-%")&.order(:id) || Clinic::Care::Patient.none
      end

      def development_omni_preview_patient
        return unless development_omni_preview?

        patients = development_omni_preview_patients
        selected = patients.find_by(id: session[:patient_portal_preview_patient_id])
        selected || patients.first
      end

      def block_non_billing_action
        render json: {
          error: "This patient portal release supports billing only.",
          code: "patient_portal_billing_only"
        }, status: :not_found
      end

      def record_portal_read(action_code)
        Clinic::AuditRecorder.record!(practice: portal_practice, actor: current_user,
          action_code: action_code, outcome: :released)
      end
    end
  end
end
