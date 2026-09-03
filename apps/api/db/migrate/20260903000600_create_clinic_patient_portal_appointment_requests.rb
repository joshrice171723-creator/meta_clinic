class CreateClinicPatientPortalAppointmentRequests < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_patient_portal_appointment_requests do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :identity_id, null: false
      t.string :request_key, null: false
      t.datetime :starts_at, null: false
      t.datetime :ends_at, null: false
      t.bigint :site_id
      t.bigint :visit_type_id
      t.string :status, null: false, default: "pending"
      t.datetime :requested_at, null: false
      t.datetime :reviewed_at
      t.string :review_note
      t.timestamps
    end

    add_index :clinic_patient_portal_appointment_requests, [ :practice_id, :id ], unique: true,
      name: "clinic_patient_portal_appointment_requests_practice_id"
    add_index :clinic_patient_portal_appointment_requests, [ :practice_id, :request_key ], unique: true,
      name: "clinic_patient_portal_appointment_requests_request_key"
    add_index :clinic_patient_portal_appointment_requests, [ :practice_id, :patient_id, :status, :starts_at ],
      name: "clinic_patient_portal_appointment_requests_worklist"
    add_check_constraint :clinic_patient_portal_appointment_requests,
      "status IN ('pending', 'approved', 'declined', 'cancelled') AND ends_at > starts_at",
      name: "clinic_patient_portal_appointment_requests_values"
    add_foreign_key :clinic_patient_portal_appointment_requests, :clinic_practices, column: :practice_id,
      name: "fk_patient_portal_appointment_requests_practice"
    add_foreign_key :clinic_patient_portal_appointment_requests, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ],
      name: "fk_patient_portal_appointment_requests_patient"
    add_foreign_key :clinic_patient_portal_appointment_requests, :clinic_patient_portal_identities,
      column: [ :practice_id, :identity_id ], primary_key: [ :practice_id, :id ],
      name: "fk_patient_portal_appointment_requests_identity"
    add_foreign_key :clinic_patient_portal_appointment_requests, :clinic_sites,
      column: [ :practice_id, :site_id ], primary_key: [ :practice_id, :id ],
      name: "fk_patient_portal_appointment_requests_site"
    add_foreign_key :clinic_patient_portal_appointment_requests, :clinic_visit_types,
      column: [ :practice_id, :visit_type_id ], primary_key: [ :practice_id, :id ],
      name: "fk_patient_portal_appointment_requests_visit_type"
  end
end
