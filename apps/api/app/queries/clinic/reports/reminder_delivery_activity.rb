module Clinic
  module Reports
    class ReminderDeliveryActivity
      def self.call(practice:, actor:)
        Clinic::Authorization.authorize!(actor:, practice:, action: "reminders.read")
        reminders = practice.patient_reminders
        counts = reminders.group(:status).count
        attention_states = %w[failed delivery_unknown]
        {
          source: "clinic_patient_reminders", as_of: Time.current.iso8601(6),
          total: counts.values.sum,
          state_counts: Clinic::PatientReminder::STATES.keys.index_with { |state| counts.fetch(state, 0) },
          needs_attention_count: attention_states.sum { |state| counts.fetch(state, 0) },
          latest_state_change_at: reminders.maximum(:updated_at)&.iso8601(6)
        }
      end
    end
  end
end
