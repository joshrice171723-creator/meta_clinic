class LinkAppointmentRequestsToBookings < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_patient_portal_appointment_requests, :appointment_id, :bigint
    add_column :clinic_patient_portal_appointment_requests, :reviewed_by_membership_id, :bigint
    change_column :clinic_patient_portal_appointment_requests, :review_note, :text

    add_index :clinic_patient_portal_appointment_requests, [ :practice_id, :appointment_id ],
      unique: true, where: "appointment_id IS NOT NULL",
      name: "clinic_patient_portal_appointment_requests_appointment"
    add_foreign_key :clinic_patient_portal_appointment_requests, :clinic_appointments,
      column: [ :practice_id, :appointment_id ], primary_key: [ :practice_id, :id ],
      name: "fk_patient_portal_appointment_requests_appointment"
    add_foreign_key :clinic_patient_portal_appointment_requests, :clinic_memberships,
      column: [ :practice_id, :reviewed_by_membership_id ], primary_key: [ :practice_id, :id ],
      name: "fk_patient_portal_appointment_requests_reviewer"
  end
end
