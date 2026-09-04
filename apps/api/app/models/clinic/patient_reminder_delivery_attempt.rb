module Clinic
  class PatientReminderDeliveryAttempt < ApplicationRecord
    self.table_name = "clinic_patient_reminder_delivery_attempts"
    include TenantScoped
    include AppendOnly

    belongs_to :reminder, class_name: "Clinic::PatientReminder"
    validates :attempt_number, numericality: { only_integer: true, greater_than: 0 }
    validates :idempotency_key, :status, :masked_destination, :queued_at, presence: true
    validate :reminder_belongs_to_practice

    private

    def reminder_belongs_to_practice
      errors.add(:reminder, "must belong to this practice") if reminder && reminder.practice_id != practice_id
    end
  end
end
