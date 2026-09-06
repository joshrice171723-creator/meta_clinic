module Clinic
  class RemindersController < Clinic::BaseController
    before_action -> { require_capability("reminders.read") }, only: %i[index show]
    before_action -> { require_capability("reminders.write") }, only: %i[create pause cancel retry dispatch_reminder record_delivery recover]

    def recover
      render json: Clinic::Reminders::RecoverJob.perform_now(
        practice_id: current_practice.id, actor_id: current_user.id
      )
    end

    def index
      reminders = current_practice.patient_reminders.includes(:patient, :communication_endpoint, :outbox)
      reminders = reminders.where(patient_id: requested_id!(params[:patient_id], :patient_id)) if params[:patient_id].present?
      reminders = reminders.where(status: required_string!(params[:status], field: :status, maximum: 40)) if params[:status].present?
      paginate(reminders, key: :reminders, serializer: ->(reminder) { PatientReminderSerializer.call(reminder) }, order: { scheduled_at: :asc, id: :asc })
    end

    def show
      reminder = current_practice.patient_reminders.includes(:communication_endpoint, :delivery_attempts).find(requested_id!(params[:id], :id))
      render json: { reminder: PatientReminderSerializer.call(reminder, detail: true) }
    end

    def create
      input = parameter_hash!(:reminder, %i[request_key patient_id appointment_id category channel scheduled_at endpoint_id expires_at])
      appointment = input[:appointment_id].present? ? current_practice.appointments.find(requested_id!(input[:appointment_id], :appointment_id)) : nil
      reminder = Clinic::Reminders::Create.call(
        practice: current_practice, actor: current_user, patient: current_practice.patients.find(requested_id!(input[:patient_id], :patient_id)),
        request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
        category: enum_param!(input[:category], field: :category, allowed: PatientReminder::CATEGORIES),
        channel: enum_param!(input[:channel], field: :channel, allowed: PatientReminder::CHANNELS),
        scheduled_at: time_param!(input[:scheduled_at], field: :scheduled_at), endpoint_id: input[:endpoint_id].present? ? requested_id!(input[:endpoint_id], :endpoint_id) : nil,
        appointment: appointment, expires_at: input[:expires_at].present? ? time_param!(input[:expires_at], field: :expires_at) : nil
      )
      render json: { id: reminder.id, reminder: PatientReminderSerializer.call(reminder, detail: true) }, status: :created
    end

    def pause
      transition("paused", "staff_pause")
    end

    def cancel
      reminder = reminder_record
      reason = required_string!(params[:reason], field: :reason, maximum: 120)
      reminder.with_lock do
        reminder.update!(status: "cancelled", cancelled_at: Time.current, cancel_reason: reason)
        reminder.outbox.update!(dispatch_state: "suppressed")
      end
      head :no_content
    end

    def retry
      reminder = reminder_record
      render json: { reminder: PatientReminderSerializer.call(Clinic::Reminders::Dispatch.call(reminder: reminder, actor: current_user), detail: true) }
    end

    def dispatch_reminder
      reminder = reminder_record
      render json: { reminder: PatientReminderSerializer.call(Clinic::Reminders::Dispatch.call(reminder: reminder, actor: current_user), detail: true) }
    end

    def record_delivery
      reminder = reminder_record
      input = parameter_hash!(:delivery, %i[provider_event_reference outcome delivery_attempt_id request_key])
      attempt = Clinic::Reminders::RecordDelivery.call(reminder: reminder, actor: current_user,
        provider_event_reference: required_string!(input[:provider_event_reference], field: :provider_event_reference, maximum: 120),
        outcome: enum_param!(input[:outcome], field: :outcome, allowed: Clinic::Reminders::RecordDelivery::OUTCOMES),
        delivery_attempt_id: input[:delivery_attempt_id].present? ? requested_id!(input[:delivery_attempt_id], :delivery_attempt_id) : nil,
        request_key: optional_string(input[:request_key], field: :request_key, maximum: 160))
      render json: { delivery_attempt: { id: attempt.id, reminder_id: reminder.id, status: attempt.status } }
    end

    private

    def reminder_record
      current_practice.patient_reminders.find(requested_id!(params[:id], :id))
    end

    def transition(target, reason)
      reminder = reminder_record
      reminder.with_lock { reminder.transition_to!(target); reminder.outbox.update!(dispatch_state: "pending") if target == "paused" }
      Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "reminders.#{reason}", outcome: :committed, resource_version_ref: "patient-reminder:#{reminder.id}")
      render json: { reminder: PatientReminderSerializer.call(reminder, detail: true) }
    end
  end
end
