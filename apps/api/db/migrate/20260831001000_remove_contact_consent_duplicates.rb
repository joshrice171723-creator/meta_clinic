class RemoveContactConsentDuplicates < ActiveRecord::Migration[8.1]
  def change
    remove_column :clinic_patient_contacts, :appointment_reminders_consent, :boolean
    remove_column :clinic_patient_contacts, :general_communications_consent, :boolean
  end
end
