module Clinic
  class PracticeFeaturesController < ApiController
    before_action -> { require_capability_with_legacy("facilities.read", "appointments.book", any_site: true) }, only: :show
    before_action -> { require_capability_with_legacy("facilities.write", "appointments.write", any_site: true) }, only: :update

    def show
      render json: { features: feature_snapshot }
    end

    def update
      input = parameter_hash!(
        :features,
        %i[insurance_workflows_enabled clinic_type expected_revision request_key finalize],
        arrays: %i[service_scope assessment_scope]
      )
      raise ArgumentError, "insurance_workflows_enabled is required" unless input.key?(:insurance_workflows_enabled)
      raise ArgumentError, "clinic_type is required" unless input.key?(:clinic_type)
      raise ArgumentError, "service_scope is required" unless input.key?(:service_scope)
      raise ArgumentError, "assessment_scope is required" unless input.key?(:assessment_scope)
      raise ArgumentError, "expected_revision is required" unless input.key?(:expected_revision)
      features = Clinic::Configuration::PracticeFeatures.revise(
        practice: current_practice, actor: clinic_membership,
        request_key: input[:request_key], expected_revision: input[:expected_revision],
        insurance_workflows_enabled: input[:insurance_workflows_enabled],
        clinic_type: input[:clinic_type], service_scope: input[:service_scope],
        assessment_scope: input[:assessment_scope], finalize: input[:finalize] == true
      )
      render json: { features: features }
    end

    private

    def feature_snapshot
      Clinic::Configuration::PracticeFeatures.snapshot(practice: current_practice)
    end
  end
end
