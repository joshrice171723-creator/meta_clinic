module Clinic
  module Reminders
    class RecordAction
      ACTIONS = %w[confirm request_reschedule request_help dismiss].freeze

      def self.call(reminder:, patient:, actor:, request_key:, action_type:)
        raise ArgumentError, "Choose a supported reminder action." unless ACTIONS.include?(action_type.to_s)
        raise ActiveRecord::RecordNotFound unless reminder.patient_id == patient.id
        existing = reminder.actions.find_by(request_key: request_key)
        return existing if existing
        ApplicationRecord.transaction do
          action = reminder.actions.create!(practice: reminder.practice, patient: patient, actor: actor,
            request_key: request_key, action_type: action_type.to_s)
          reminder.update!(status: "actioned") if %w[confirm dismiss].include?(action_type.to_s) && reminder.status == "delivered"
          AuditRecorder.record!(practice: reminder.practice, actor: actor, action_code: "reminders.patient_action.#{action_type}", outcome: :committed,
            resource_version_ref: "patient-reminder:#{reminder.id}")
          action
        end
      rescue ActiveRecord::RecordNotUnique
        reminder.actions.find_by!(request_key: request_key)
      end
    end
  end
end
