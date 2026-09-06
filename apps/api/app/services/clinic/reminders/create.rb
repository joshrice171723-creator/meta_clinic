module Clinic
  module Reminders
    class Create
      SAFE_PREVIEWS = {
        "appointment" => "You have an upcoming appointment. Sign in to view details.",
        "preparation" => "A preparation task is due for your care. Sign in to view details.",
        "medication" => "A medication-related task is due. Sign in to view details.",
        "follow_up" => "A follow-up action is due. Sign in to view details."
      }.freeze

      def self.call(practice:, actor:, patient:, request_key:, category:, channel:, scheduled_at:, endpoint_id: nil, appointment: nil, expires_at: nil, content: nil)
        Authorization.authorize!(actor: actor, practice: practice, action: "reminders.write")
        patient = practice.patients.find(patient.respond_to?(:id) ? patient.id : patient)
        appointment = practice.appointments.find(appointment.id) if appointment
        raise ArgumentError, "The appointment must belong to the selected patient." if appointment && appointment.patient_id != patient.id
        endpoint = select_endpoint(practice, patient, endpoint_id, channel)
        scheduled_at = scheduled_at.to_time
        timezone = practice.timezone
        dedupe_key = request_key.to_s
        source_type = appointment ? "Clinic::Appointment" : "Clinic::Patient"
        source_id = appointment ? appointment.id : patient.id
        source_version = appointment ? appointment.updated_at.utc.iso8601 : "patient-#{patient.id}"
        message_content = content.to_s.strip.presence || SAFE_PREVIEWS.fetch(category.to_s)
        raise ArgumentError, "Message must be 480 characters or fewer." if message_content.length > 480

        ApplicationRecord.transaction do
          existing = Clinic::PatientReminder.find_by(practice: practice, dedupe_key: dedupe_key)
          if existing
            return existing if compatible?(existing, patient:, category:, channel:, endpoint:, scheduled_at:, content: message_content)

            raise ArgumentError, "This reminder request key was already used for different data."
          end
          reminder = practice.patient_reminders.create!(
            patient: patient, communication_endpoint: endpoint, source_type: source_type, source_id: source_id,
            source_version: source_version, category: category.to_s, channel: channel.to_s,
            safe_content_version: content.present? ? "custom-v1" : "#{category}-v1",
            safe_preview: SAFE_PREVIEWS.fetch(category.to_s), content: message_content,
            scheduled_at: scheduled_at, timezone: timezone,
            local_schedule_label: scheduled_at.in_time_zone(timezone).strftime("%b %-d, %Y at %-I:%M %p %Z"),
            status: "scheduled", dedupe_key: dedupe_key, expires_at: expires_at || scheduled_at + 7.days,
            policy_decision_code: "created_pending_dispatch", policy_version: Policy::VERSION
          )
          reminder.create_outbox!(practice: practice, idempotency_key: "reminder:#{practice.id}:#{dedupe_key}", available_at: scheduled_at)
          AuditRecorder.record!(practice: practice, actor: actor, action_code: "reminders.create", outcome: :committed,
            resource_version_ref: "patient-reminder:#{reminder.id}")
          reminder
        end
      rescue ActiveRecord::RecordNotUnique
        retry_existing = Clinic::PatientReminder.find_by!(practice: practice, dedupe_key: request_key)
        return retry_existing if compatible?(retry_existing, patient:, category:, channel:, endpoint:, scheduled_at:, content: message_content)
        raise ArgumentError, "This reminder request key was already used for different data."
      end

      def self.select_endpoint(practice, patient, endpoint_id, channel)
        endpoint = if endpoint_id
          practice.communication_endpoints.find(endpoint_id)
        else
          practice.communication_endpoints.where(patient: patient, endpoint_type: endpoint_type(channel)).verified.order(:id).first
        end
        raise ArgumentError, "A verified #{channel} endpoint is required before scheduling a reminder." unless endpoint&.patient_id == patient.id && endpoint.endpoint_type == endpoint_type(channel) && endpoint.verified_at.present? && endpoint.invalidated_at.blank?
        endpoint
      end
      private_class_method :select_endpoint

      def self.endpoint_type(channel)
        channel.to_s == "sms" ? "phone" : channel.to_s
      end
      private_class_method :endpoint_type

      def self.compatible?(record, patient:, category:, channel:, endpoint:, scheduled_at:, content:)
        record.patient_id == patient.id && record.category == category.to_s && record.channel == channel.to_s &&
          record.communication_endpoint_id == endpoint.id && record.scheduled_at.to_i == scheduled_at.to_i &&
          record.content == content
      end
      private_class_method :compatible?
    end
  end
end
