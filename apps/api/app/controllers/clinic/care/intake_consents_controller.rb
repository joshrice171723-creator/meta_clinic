module Clinic
  module Care
    class IntakeConsentsController < Clinic::ApiController
      before_action -> { require_capability("patients.read") }
      before_action -> { require_capability("intake.write", any_site: true) }, only: :create

      def show
        patient = scoped_patient
        IntakeConsents.authorize!(practice: current_practice, actor: current_user, patient:)
        render json: envelope(patient)
      end

      def create
        patient = scoped_patient
        input = params.require(:intake_consent)
        unless input.is_a?(ActionController::Parameters) &&
            (input.keys - %w[purpose payload expected_revision request_key]).empty? &&
            input[:payload].is_a?(ActionController::Parameters)
          raise ArgumentError, "Provide consent purpose, evidence, expected version and request key."
        end
        IntakeConsents.save!(practice: current_practice, actor: current_user, patient:,
          purpose: input[:purpose].to_s, payload: input[:payload].to_unsafe_h.deep_stringify_keys,
          expected_revision: bounded_integer!(input[:expected_revision], field: :expected_revision, max: 2_147_483_646),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160))
        render json: envelope(patient), status: :created
      end

      private

      def scoped_patient
        current_practice.patients.accessible_by(current_ability, :read).find(requested_id!(params[:patient_id], :patient_id))
      end

      def envelope(patient)
        latest = IntakeConsents.latest(practice: current_practice, patient:)
        documents = if current_ability.allowed_permission?("documents.read")
          IntakeConsents.document_options(practice: current_practice, actor: current_user, patient:)
        else
          []
        end
        { intake_consents: latest.transform_values { |record| record && record_json(record) },
          can_write: current_ability.allowed_permission?("intake.write", any_site: true),
          purposes: IntakeConsentRevision::PURPOSES, evidence_options: { source_documents: documents } }
      end

      def record_json(record)
        record.payload.merge("id" => record.id, "purpose" => record.purpose, "revision" => record.revision,
          "recorded_at" => record.recorded_at.iso8601(6), "recorded_by_membership_id" => record.recorded_by_membership_id)
      end

      def sensitive_read_action
        "patients.read"
      end
    end
  end
end
