module Clinic
  class PatientReminderOutbox < ApplicationRecord
    self.table_name = "clinic_patient_reminder_outbox"
    include TenantScoped
    include Auditable

    belongs_to :reminder, class_name: "Clinic::PatientReminder"
    STATES = %w[pending leased accepted delivered failed unknown suppressed].freeze
    validates :dispatch_state, inclusion: { in: STATES }
    validates :idempotency_key, :available_at, presence: true
    validate :reminder_belongs_to_practice

    private

    def reminder_belongs_to_practice
      errors.add(:reminder, "must belong to this practice") if reminder && reminder.practice_id != practice_id
    end
  end
end
