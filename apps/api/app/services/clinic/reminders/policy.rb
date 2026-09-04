module Clinic
  module Reminders
    class Policy
      VERSION = "patient-reminders-policy-v1"

      def self.evaluate(reminder:, at: Time.current)
        endpoint = reminder.communication_endpoint
        return deny("endpoint_unverified") unless endpoint&.verified_at.present? && endpoint.invalidated_at.blank?
        return deny("endpoint_channel_mismatch") unless endpoint.endpoint_type == reminder.channel
        return deny("expired") if reminder.expires_at.present? && reminder.expires_at <= at

        preference = Clinic::CommunicationPreference.where(
          practice_id: reminder.practice_id, patient_id: reminder.patient_id,
          category: "operational", channel: reminder.channel
        ).order(version: :desc).first
        return deny("patient_opted_out") if preference&.blocked?
        return deny("quiet_hours") if quiet_hours?(reminder, preference, at)

        { allowed: true, code: "eligible", version: VERSION }
      end

      def self.quiet_hours?(reminder, preference, at)
        return false unless preference&.quiet_hours_start && preference.quiet_hours_end

        local_time = at.in_time_zone(preference.timezone).strftime("%H:%M:%S")
        start_time = preference.quiet_hours_start.strftime("%H:%M:%S")
        end_time = preference.quiet_hours_end.strftime("%H:%M:%S")
        start_time < end_time ? local_time >= start_time && local_time < end_time : local_time >= start_time || local_time < end_time
      end
      private_class_method :quiet_hours?

      def self.deny(code)
        { allowed: false, code: code, version: VERSION }
      end
      private_class_method :deny
    end
  end
end
