module Clinic
  class PracticeFeaturesController < ApiController
    before_action -> { require_capability("facilities.read", any_site: true) }, only: :show
    before_action -> { require_capability("facilities.write", any_site: true) }, only: :update

    def show
      render json: payload
    end

    def update
      input = parameter_hash!(:practice_features,
        %i[expected_version insurance_workflows_enabled reason request_key effective_from])
      Clinic::Configuration::PracticeFeatures.revise(
        practice: current_practice,
        actor: current_user,
        expected_version: bounded_integer!(input[:expected_version], field: :expected_version, min: 0, max: 1_000_000),
        insurance_workflows_enabled: input[:insurance_workflows_enabled],
        reason: required_string!(input[:reason], field: :reason, maximum: 240),
        request_key: request_key!(input[:request_key]),
        effective_from: input[:effective_from].present? ? time_param!(input[:effective_from], field: :effective_from) : Current.business_time
      )
      render json: payload
    end

    private

    def payload
      Clinic::Configuration::PracticeFeatures.snapshot(practice: current_practice).merge(
        can_write: current_ability.allowed_permission?("facilities.write", any_site: true)
      )
    end
  end
end
