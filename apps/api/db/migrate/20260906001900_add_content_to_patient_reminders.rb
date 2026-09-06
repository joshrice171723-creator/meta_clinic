class AddContentToPatientReminders < ActiveRecord::Migration[8.1]
  class EncryptedPatientReminder < ActiveRecord::Base
    self.table_name = "clinic_patient_reminders"
    encrypts :content
  end

  def up
    add_column :clinic_patient_reminders, :content, :text

    EncryptedPatientReminder.reset_column_information
    EncryptedPatientReminder.find_each do |reminder|
      reminder.update_columns(content: reminder.safe_preview)
    end

    change_column_null :clinic_patient_reminders, :content, false
  end

  def down
    remove_column :clinic_patient_reminders, :content
  end
end
