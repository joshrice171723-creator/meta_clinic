module Clinic
  class RemindersController < Clinic::BaseController
    before_action -> { require_capability("reminders.read") }, only: %i[index show batch_preview]
    before_action -> { require_capability("reminders.write") }, only: %i[create batch_schedule pause cancel retry dispatch_reminder record_delivery recover staff_handoff]

    rescue_from ArgumentError do |error|
      render json: { error: error.message, code: "invalid_request" }, status: :unprocessable_entity
    end

    def recover
      render json: Clinic::Reminders::RecoverJob.perform_now(
        practice_id: current_practice.id, actor_id: current_user.id
      )
    end

    def index
      reminders = current_practice.patient_reminders.includes(
        :patient,
        :communication_endpoint,
        :actions,
        :delivery_attempts
      )
      reminders = reminders.where(id: requested_id!(params[:reminder_id], :reminder_id)) if params[:reminder_id].present?
      reminders = reminders.where(patient_id: requested_id!(params[:patient_id], :patient_id)) if params[:patient_id].present?
      reminders = reminders.where(status: required_string!(params[:status], field: :status, maximum: 40)) if params[:status].present?
      if params[:q].present?
        matching_patients = Clinic::Care::PatientNameSearch.search(
          scope: current_practice.patients,
          practice_id: current_practice.id,
          query: query_param
        )
        reminders = reminders.where(patient_id: matching_patients.select(:id))
      end
      history = enum_param!(params[:history], field: :history, allowed: %w[all sent]) if params[:history].present?
      reminders = reminders.joins(:delivery_attempts).distinct if history == "sent"
      attention = boolean_or_default(params[:attention], field: :attention) if params.key?(:attention)
      reminders = Clinic::Reminders::ExceptionQueue.call(scope: reminders) if attention
      detailed = history == "sent" || attention
      order = detailed ? { updated_at: :desc, id: :desc } : { scheduled_at: :asc, id: :asc }
      records, pagination = paginated_records(reminders, order: order)
      records = records.to_a
      appointment_ids = records.filter_map { |reminder| reminder.source_id if reminder.source_type == "Clinic::Appointment" }
      appointments = current_practice.appointments.where(id: appointment_ids).index_by(&:id)
      handoffs = Clinic::Reminders::StaffHandoff.summaries(reminders: records, actor: current_user)
      render json: { reminders: records.map { |reminder|
        PatientReminderSerializer.call(reminder, detail: detailed, actor: current_user,
          staff_handoff: handoffs.fetch(reminder.id), include_content: true, appointment: appointments[reminder.source_id])
      }, pagination: pagination }
    end

    def show
      reminder = current_practice.patient_reminders.includes(:communication_endpoint, :delivery_attempts).find(requested_id!(params[:id], :id))
      render json: { reminder: PatientReminderSerializer.call(reminder, detail: true, actor: current_user) }
    end

    def create
      input = parameter_hash!(:reminder, %i[request_key patient_id appointment_id category channel scheduled_at endpoint_id expires_at content])
      appointment = input[:appointment_id].present? ? current_practice.appointments.find(requested_id!(input[:appointment_id], :appointment_id)) : nil
      reminder = Clinic::Reminders::Create.call(
        practice: current_practice, actor: current_user, patient: current_practice.patients.find(requested_id!(input[:patient_id], :patient_id)),
        request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
        category: enum_param!(input[:category], field: :category, allowed: PatientReminder::CATEGORIES),
        channel: enum_param!(input[:channel], field: :channel, allowed: PatientReminder::CHANNELS),
        scheduled_at: time_param!(input[:scheduled_at], field: :scheduled_at), endpoint_id: input[:endpoint_id].present? ? requested_id!(input[:endpoint_id], :endpoint_id) : nil,
        appointment: appointment, expires_at: input[:expires_at].present? ? time_param!(input[:expires_at], field: :expires_at) : nil,
        content: optional_string(input[:content], field: :content, maximum: 480)
      )
      render json: { id: reminder.id, reminder: PatientReminderSerializer.call(reminder, detail: true, actor: current_user) }, status: :created
    end

    def batch_preview
      render json: Clinic::Reminders::AppointmentBatch.preview(
        practice: current_practice, actor: current_user, appointment_ids: batch_appointment_ids
      )
    end

    def batch_schedule
      render json: Clinic::Reminders::AppointmentBatch.schedule(
        practice: current_practice, actor: current_user, items: batch_schedule_items
      )
    end

    def pause
      transition("paused", "staff_pause")
    end

    def cancel
      reminder = reminder_record
      reason = required_string!(params[:reason], field: :reason, maximum: 120)
      reminder.with_lock do
        reminder.update!(status: "cancelled", cancelled_at: Current.business_time, cancel_reason: reason)
        reminder.outbox.update!(dispatch_state: "suppressed")
      end
      head :no_content
    end

    def retry
      reminder = reminder_record
      render json: { reminder: PatientReminderSerializer.call(Clinic::Reminders::Dispatch.call(reminder: reminder, actor: current_user), detail: true, actor: current_user) }
    end

    def dispatch_reminder
      reminder = reminder_record
      render json: { reminder: PatientReminderSerializer.call(Clinic::Reminders::Dispatch.call(reminder: reminder, actor: current_user), detail: true, actor: current_user) }
    end

    def staff_handoff
      input = parameter_hash!(:handoff, %i[conversation_id assignee_membership_id due_at action_id])
      request = Clinic::Reminders::StaffHandoff.call(
        practice: current_practice, actor: current_user, reminder: reminder_record,
        conversation_id: requested_id!(input[:conversation_id], :conversation_id),
        assignee_membership_id: requested_id!(input[:assignee_membership_id], :assignee_membership_id),
        due_at: time_param!(input[:due_at], field: :due_at),
        action_id: input[:action_id].present? ? requested_id!(input[:action_id], :action_id) : nil
      )
      render json: { staff_handoff: { id: request.id, state: request.state,
        assignee_membership_id: request.assignee_membership_id, due_at: request.due_at&.iso8601(6) } }
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

    def batch_appointment_ids
      value = params.require(:appointment_ids)
      raise ArgumentError, "appointment_ids must be an array." unless value.is_a?(Array)

      value
    end

    def batch_schedule_items
      value = params.require(:items)
      raise ArgumentError, "items must be an array." unless value.is_a?(Array)

      value.map do |item|
        raise ArgumentError, "Each item must be an object." unless item.is_a?(ActionController::Parameters)

        item.permit(:appointment_id, :preview_digest).to_h
      end
    end

    def reminder_record
      current_practice.patient_reminders.find(requested_id!(params[:id], :id))
    end

    def transition(target, reason)
      reminder = reminder_record
      reminder.with_lock { reminder.transition_to!(target); reminder.outbox.update!(dispatch_state: "pending") if target == "paused" }
      Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "reminders.#{reason}", outcome: :committed, resource_version_ref: "patient-reminder:#{reminder.id}")
      render json: { reminder: PatientReminderSerializer.call(reminder, detail: true, actor: current_user) }
    end
  end
end
