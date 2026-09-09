class AddReasonToClinicAppointments < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_appointments, :reason, :text
  end
end
