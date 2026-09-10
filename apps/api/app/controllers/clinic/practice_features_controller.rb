module Clinic
  class PracticeFeaturesController < ApiController
    before_action -> { require_capability_with_legacy("facilities.read", "appointments.book", any_site: true) }, only: :show
    before_action -> { require_capability_with_legacy("facilities.write", "appointments.write", any_site: true) }, only: :update

    def show
      render json: { features: feature_snapshot }
    end

    def update
      input = parameter_hash!(:features, %i[insurance_workflows_enabled expected_revision request_key])
      raise ArgumentError, "insurance_workflows_enabled is required" unless input.key?(:insurance_workflows_enabled)
      raise ArgumentError, "expected_revision is required" unless input.key?(:expected_revision)
      features = Clinic::Configuration::PracticeFeatures.revise(
        practice: current_practice, actor: clinic_membership,
        request_key: input[:request_key], expected_revision: input[:expected_revision],
        insurance_workflows_enabled: input[:insurance_workflows_enabled]
      )
      render json: { features: features }
    end

    private

    def feature_snapshot
      Clinic::Configuration::PracticeFeatures.snapshot(practice: current_practice)
    end
  end
end
