module Clinic
  class ReminderPoliciesController < ApiController
    before_action -> { require_capability("roles.manage") }

    def show
      AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "reminders.configuration.read", outcome: :released)
      render json: { policy: Reminders::PolicyVersion.snapshot(Reminders::PolicyVersion.current(practice: current_practice)) }
    end

    def update
      input = parameter_hash!(:policy, %i[expected_revision request_key enabled lead_hours])
      raise ArgumentError, "enabled is required" unless input.key?(:enabled)
      policy = Reminders::RevisePolicy.call(practice: current_practice, actor: current_user,
        expected_revision: bounded_integer!(input[:expected_revision], field: :expected_revision),
        request_key: input[:request_key], enabled: boolean_param(input[:enabled], field: :enabled),
        lead_hours: bounded_integer!(input[:lead_hours], field: :lead_hours, min: 1, max: 168))
      render json: { policy: Reminders::PolicyVersion.snapshot(policy) }
    end
  end
end
