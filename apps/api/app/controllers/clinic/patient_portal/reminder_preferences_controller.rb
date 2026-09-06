module Clinic
  module PatientPortal
    class ReminderPreferencesController < BaseController
      before_action :block_non_billing_action

      def show
        render json: { preferences: current_preferences.map { |preference| preference_payload(preference) }, timezone: portal_practice.timezone }
      end

      def update
        input = parameter_hash!(:preference, %i[channel setting quiet_hours_start quiet_hours_end timezone locale])
        channel = enum_param!(input[:channel], field: :channel, allowed: %w[portal sms email])
        setting = enum_param!(input[:setting], field: :setting, allowed: %w[allowed blocked not_set])
        timezone = input[:timezone].presence || portal_practice.timezone
        raise ArgumentError, "Choose a supported time zone." unless ActiveSupport::TimeZone::MAPPING.values.include?(timezone) || timezone == "UTC"
        current = current_preferences.find { |preference| preference.channel == channel }
        version = current ? current.version + 1 : 1
        preference = portal_practice.communication_preferences.create!(patient: portal_patient, category: "operational", channel: channel,
          setting: setting, quiet_hours_start: input[:quiet_hours_start].presence, quiet_hours_end: input[:quiet_hours_end].presence,
          timezone: timezone, locale: input[:locale].presence || "en-US", effective_at: Current.business_time, source: "patient_portal", version: version)
        record_portal_read("patient_portal.reminder_preferences.update")
        render json: { preference: preference_payload(preference) }, status: :created
      end

      private

      def current_preferences
        portal_patient.communication_preferences.where(category: "operational").select { |preference| preference.id == portal_patient.communication_preferences.where(category: "operational", channel: preference.channel).maximum(:id) }
      end

      def preference_payload(preference)
        { id: preference.id, category: preference.category, channel: preference.channel, setting: preference.setting,
          quiet_hours_start: preference.quiet_hours_start&.strftime("%H:%M"), quiet_hours_end: preference.quiet_hours_end&.strftime("%H:%M"),
          timezone: preference.timezone, locale: preference.locale, effective_at: preference.effective_at.iso8601(6), version: preference.version }
      end
    end
  end
end
