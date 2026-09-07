require "digest"

module Clinic
  module Reminders
    class AppointmentBatch
      MAX_ITEMS = 100
      CHANNEL = "sms"
      ACTIVE_APPOINTMENT_STATUSES = %w[scheduled confirmed].freeze
      POLICY_REASONS = {
        "appointment_reminder_consent_missing" => "Appointment reminder consent is not recorded.",
        "endpoint_unverified" => "A verified text-message destination is required.",
        "endpoint_channel_mismatch" => "The selected destination cannot receive text reminders.",
        "patient_opted_out" => "The patient opted out of operational text messages.",
        "quiet_hours" => "The 24-hour reminder time falls within the patient's quiet hours.",
        "source_cancelled" => "The appointment is no longer eligible for a reminder.",
        "expired" => "The reminder would already be expired."
      }.freeze

      def self.preview(practice:, actor:, appointment_ids:, at: Current.business_time)
        ids = validate_ids!(appointment_ids)
        appointments = authorized_appointments!(practice:, actor:, ids:)
        items = ids.map { |id| preview_item(practice:, appointment: appointments.fetch(id), at:).except(:endpoint_id) }
        { items: items, ready_count: items.count { |item| item[:status] == "ready" } }
      end

      def self.schedule(practice:, actor:, items:, at: Current.business_time)
        entries = validate_entries!(items)
        appointments = authorized_appointments!(practice:, actor:, ids: entries.map { |item| item.fetch(:appointment_id) })
        results = entries.map do |entry|
          appointment = appointments.fetch(entry.fetch(:appointment_id))
          appointment.with_lock do
            plan = preview_item(practice:, appointment:, at:)
            if plan[:status] == "already_scheduled"
              existing = existing_reminder(practice, appointment)
              next { appointment_id: appointment.id, status: "already_scheduled",
                reminder_id: existing&.id, reason: nil }
            end
            unless plan[:status] == "ready"
              next { appointment_id: appointment.id, status: "skipped", reminder_id: nil, reason: plan[:reason] }
            end
            unless ActiveSupport::SecurityUtils.secure_compare(plan.fetch(:preview_digest), entry.fetch(:preview_digest))
              next { appointment_id: appointment.id, status: "skipped", reminder_id: nil,
                reason: "Appointment reminder details changed. Preview again." }
            end

            reminder = Create.call(
              practice:, actor:, patient: appointment.patient,
              request_key: "appointment-batch:#{appointment.id}:#{plan.fetch(:preview_digest)}",
              category: "appointment", channel: CHANNEL, scheduled_at: Time.iso8601(plan.fetch(:scheduled_at)),
              endpoint_id: plan.fetch(:endpoint_id), appointment:, expires_at: appointment.starts_at,
              content: plan.fetch(:message)
            )
            { appointment_id: appointment.id, status: "scheduled", reminder_id: reminder.id, reason: nil }
          end
        rescue ArgumentError => error
          { appointment_id: appointment.id, status: "skipped", reminder_id: nil, reason: error.message }
        end
        { results: results }
      end

      def self.preview_item(practice:, appointment:, at:)
        base = {
          appointment_id: appointment.id,
          patient: { id: appointment.patient.id, display_name: appointment.patient.display_name,
            reference: appointment.patient.reference },
          starts_at: appointment.starts_at.iso8601(6), scheduled_at: nil, timezone: practice.timezone,
          masked_destination: nil, message: nil, status: "unavailable", reason: nil, preview_digest: nil
        }
        existing = existing_reminder(practice, appointment)
        if existing
          return base.merge(status: "already_scheduled", scheduled_at: existing.scheduled_at.iso8601(6),
            masked_destination: existing.communication_endpoint.masked_value,
            reason: "An appointment reminder is already scheduled.")
        end
        unless ACTIVE_APPOINTMENT_STATUSES.include?(appointment.status)
          return base.merge(reason: "The appointment is no longer eligible for a reminder.")
        end

        scheduled_at = appointment.starts_at - 24.hours
        base[:scheduled_at] = scheduled_at.iso8601(6)
        return base.merge(reason: "Appointments inside 24 hours use the manual reminder flow.") if scheduled_at <= at

        endpoint = Create.endpoint_for(practice:, patient: appointment.patient, channel: CHANNEL)
        base[:masked_destination] = endpoint.masked_value
        message = message_for(practice, appointment)
        candidate = practice.patient_reminders.new(
          patient: appointment.patient, communication_endpoint: endpoint,
          source_type: "Clinic::Appointment", source_id: appointment.id, source_version: source_version(appointment),
          category: "appointment", channel: CHANNEL, scheduled_at:, expires_at: appointment.starts_at,
          timezone: practice.timezone, content: message
        )
        decision = Policy.evaluate(reminder: candidate, at: scheduled_at)
        return base.merge(reason: POLICY_REASONS.fetch(decision.fetch(:code), "This reminder is not currently eligible.")) unless
          decision.fetch(:allowed)

        digest = preview_digest(appointment:, endpoint:, scheduled_at:, message:,
          cancelled_reminder: latest_cancelled_reminder(practice, appointment))
        base.merge(status: "ready", message:, reason: nil, preview_digest: digest, endpoint_id: endpoint.id)
      rescue ArgumentError
        base.merge(reason: "A verified text-message destination is required.")
      end
      private_class_method :preview_item

      def self.authorized_appointments!(practice:, actor:, ids:)
        records = practice.appointments.includes(patient: %i[communication_preference communication_endpoints])
          .where(id: ids).index_by(&:id)
        raise ActiveRecord::RecordNotFound, "One or more appointments are unavailable." unless records.size == ids.size

        records.each_value do |appointment|
          Authorization.authorize!(actor:, practice:, action: "appointments.read", site: appointment.site)
        end
        records
      end
      private_class_method :authorized_appointments!

      def self.existing_reminder(practice, appointment)
        practice.patient_reminders.where(source_type: "Clinic::Appointment", source_id: appointment.id,
          category: "appointment").where.not(status: "cancelled").order(:id).first
      end
      private_class_method :existing_reminder

      def self.latest_cancelled_reminder(practice, appointment)
        practice.patient_reminders.where(source_type: "Clinic::Appointment", source_id: appointment.id,
          category: "appointment", status: "cancelled").order(id: :desc).first
      end
      private_class_method :latest_cancelled_reminder

      def self.message_for(practice, appointment)
        local = appointment.starts_at.in_time_zone(practice.timezone)
        label = local.strftime("%A, %B %-d, %Y at %-I:%M %p %Z")
        "This is a reminder from #{practice.name} about your appointment on #{label}. " \
          "Reply YA to confirm or NA if you need to reschedule."
      end
      private_class_method :message_for

      def self.preview_digest(appointment:, endpoint:, scheduled_at:, message:, cancelled_reminder:)
        payload = {
          appointment_id: appointment.id, appointment_updated_at: source_version(appointment),
          starts_at: appointment.starts_at.iso8601(6),
          endpoint_id: endpoint.id, endpoint_updated_at: endpoint.updated_at.utc.iso8601(6),
          endpoint_value_digest: endpoint.value_digest, scheduled_at: scheduled_at.iso8601(6), message: message,
          latest_cancelled_reminder_id: cancelled_reminder&.id,
          latest_cancelled_reminder_updated_at: cancelled_reminder&.updated_at&.utc&.iso8601(6)
        }
        Digest::SHA256.hexdigest(JSON.generate(payload))
      end
      private_class_method :preview_digest

      def self.source_version(appointment)
        appointment.updated_at.utc.iso8601(6)
      end
      private_class_method :source_version

      def self.validate_ids!(values)
        unless values.is_a?(Array) && values.size.between?(1, MAX_ITEMS) && values.all? { |value| value.is_a?(Integer) && value.positive? }
          raise ArgumentError, "appointment_ids must contain 1–#{MAX_ITEMS} positive integer IDs."
        end
        raise ArgumentError, "Choose each appointment once." unless values.uniq.size == values.size

        values
      end
      private_class_method :validate_ids!

      def self.validate_entries!(values)
        unless values.is_a?(Array) && values.size.between?(1, MAX_ITEMS)
          raise ArgumentError, "items must contain 1–#{MAX_ITEMS} appointment previews."
        end
        entries = values.map do |value|
          unless value.is_a?(Hash) || value.is_a?(ActionController::Parameters)
            raise ArgumentError, "Each item must be an appointment preview."
          end
          entry = value.to_h.symbolize_keys
          id = entry[:appointment_id]
          digest = entry[:preview_digest]
          unless id.is_a?(Integer) && id.positive? && digest.is_a?(String) && digest.match?(/\A\h{64}\z/)
            raise ArgumentError, "Each item requires a positive appointment_id and preview_digest."
          end
          { appointment_id: id, preview_digest: digest }
        rescue NoMethodError, TypeError
          raise ArgumentError, "Each item must be an appointment preview."
        end
        raise ArgumentError, "Choose each appointment once." unless entries.map { |entry| entry[:appointment_id] }.uniq.size == entries.size

        entries
      end
      private_class_method :validate_entries!
    end
  end
end
