module Clinic
  module PatientPortal
    class RemindersController < BaseController
      before_action :block_non_billing_action

      def index
        reminders = portal_patient.patient_reminders.includes(:communication_endpoint, :delivery_attempts).order(scheduled_at: :asc, id: :asc).limit(50)
        record_portal_read("patient_portal.reminders.read")
        render json: { reminders: reminders.map { |reminder| PatientReminderSerializer.call(reminder, detail: true) } }
      end

      def action
        reminder = portal_patient.patient_reminders.find(requested_id!(params[:id], :id))
        input = parameter_hash!(:reminder_action, %i[request_key action_type])
        result = Clinic::Reminders::RecordAction.call(reminder: reminder, patient: portal_patient, actor: current_user,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          action_type: enum_param!(input[:action_type], field: :action_type, allowed: Clinic::Reminders::RecordAction::ACTIONS))
        render json: { action: { id: result.id, reminder_id: result.reminder_id, action_type: result.action_type, outcome: result.outcome } }, status: :created
      end
    end
  end
end
