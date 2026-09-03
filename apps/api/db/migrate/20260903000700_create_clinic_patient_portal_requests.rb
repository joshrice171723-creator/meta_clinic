class CreateClinicPatientPortalRequests < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_patient_portal_requests do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :identity_id, null: false
      t.string :request_key, null: false
      t.string :request_type, null: false
      t.text :content, null: false
      t.string :content_digest, null: false
      t.string :status, null: false, default: "pending"
      t.datetime :requested_at, null: false
      t.datetime :reviewed_at
      t.string :review_note
      t.timestamps
    end

    add_index :clinic_patient_portal_requests, [ :practice_id, :id ], unique: true,
      name: "clinic_patient_portal_requests_practice_id"
    add_index :clinic_patient_portal_requests, [ :practice_id, :request_key ], unique: true,
      name: "clinic_patient_portal_requests_request_key"
    add_index :clinic_patient_portal_requests, [ :practice_id, :patient_id, :status, :requested_at ],
      name: "clinic_patient_portal_requests_worklist"
    add_check_constraint :clinic_patient_portal_requests,
      "request_type IN ('message', 'refill') AND status IN ('pending', 'in_review', 'resolved', 'declined') AND length(trim(content_digest)) > 0",
      name: "clinic_patient_portal_requests_values"
    add_foreign_key :clinic_patient_portal_requests, :clinic_practices, column: :practice_id,
      name: "fk_patient_portal_requests_practice"
    add_foreign_key :clinic_patient_portal_requests, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ],
      name: "fk_patient_portal_requests_patient"
    add_foreign_key :clinic_patient_portal_requests, :clinic_patient_portal_identities,
      column: [ :practice_id, :identity_id ], primary_key: [ :practice_id, :id ],
      name: "fk_patient_portal_requests_identity"
  end
end
