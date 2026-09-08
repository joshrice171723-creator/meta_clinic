module Clinic
  class PatientReminderAction < ApplicationRecord
    self.table_name = "clinic_patient_reminder_actions"
    include TenantScoped
    include AppendOnly

    belongs_to :reminder, class_name: "Clinic::PatientReminder"
    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :actor, class_name: "User"
    validates :request_key, :action_type, presence: true
    validates :action_type, inclusion: { in: %w[confirm request_reschedule request_help dismiss] }
    validate :records_belong_to_practice

    private

    def records_belong_to_practice
      errors.add(:patient, "must belong to this practice") if patient && patient.practice_id != practice_id
      if reminder && (reminder.practice_id != practice_id || reminder.patient_id != patient_id)
        errors.add(:reminder, "must belong to this patient and practice")
      end
    end
  end
end
