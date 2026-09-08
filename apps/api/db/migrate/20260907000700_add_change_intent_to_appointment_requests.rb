class AddChangeIntentToAppointmentRequests < ActiveRecord::Migration[8.1]
  def change
    remove_check_constraint :clinic_patient_portal_appointment_requests,
      name: "clinic_patient_portal_appointment_requests_values"

    add_column :clinic_patient_portal_appointment_requests, :request_kind, :string,
      null: false, default: "new_booking"
    add_column :clinic_patient_portal_appointment_requests, :source_appointment_id, :bigint
    add_column :clinic_patient_portal_appointment_requests, :source_appointment_updated_at, :datetime
    add_column :clinic_patient_portal_appointment_requests, :source_starts_at, :datetime
    add_column :clinic_patient_portal_appointment_requests, :source_ends_at, :datetime
    add_column :clinic_patient_portal_appointment_requests, :source_site_id, :bigint
    add_column :clinic_patient_portal_appointment_requests, :source_status, :string
    change_column_null :clinic_patient_portal_appointment_requests, :starts_at, true
    change_column_null :clinic_patient_portal_appointment_requests, :ends_at, true

    remove_index :clinic_patient_portal_appointment_requests,
      name: "clinic_patient_portal_appointment_requests_appointment"
    add_index :clinic_patient_portal_appointment_requests, [ :practice_id, :appointment_id ],
      where: "appointment_id IS NOT NULL",
      name: "clinic_patient_portal_appointment_requests_appointment"
    add_index :clinic_patient_portal_appointment_requests, [ :practice_id, :source_appointment_id ],
      unique: true, where: "status = 'pending' AND source_appointment_id IS NOT NULL",
      name: "clinic_patient_portal_appointment_requests_pending_change"
    add_index :clinic_patient_portal_appointment_requests, [ :practice_id, :source_site_id ],
      name: "clinic_patient_portal_appointment_requests_source_site"

    add_foreign_key :clinic_patient_portal_appointment_requests, :clinic_appointments,
      column: [ :practice_id, :source_appointment_id ], primary_key: [ :practice_id, :id ],
      name: "fk_patient_portal_appointment_requests_source_appointment"
    add_foreign_key :clinic_patient_portal_appointment_requests, :clinic_sites,
      column: [ :practice_id, :source_site_id ], primary_key: [ :practice_id, :id ],
      name: "fk_patient_portal_appointment_requests_source_site"

    add_check_constraint :clinic_patient_portal_appointment_requests, <<~SQL.squish,
      request_kind IN ('new_booking', 'reschedule', 'cancel')
      AND status IN ('pending', 'approved', 'declined', 'cancelled')
      AND (
        (
          request_kind = 'new_booking'
          AND source_appointment_id IS NULL
          AND source_appointment_updated_at IS NULL
          AND source_starts_at IS NULL
          AND source_ends_at IS NULL
          AND source_site_id IS NULL
          AND source_status IS NULL
          AND starts_at IS NOT NULL
          AND ends_at > starts_at
        )
        OR
        (
          request_kind = 'reschedule'
          AND source_appointment_id IS NOT NULL
          AND source_appointment_updated_at IS NOT NULL
          AND source_starts_at IS NOT NULL
          AND source_ends_at > source_starts_at
          AND source_status IN ('scheduled', 'confirmed')
          AND site_id IS NULL
          AND visit_type_id IS NULL
          AND starts_at IS NOT NULL
          AND ends_at > starts_at
        )
        OR
        (
          request_kind = 'cancel'
          AND source_appointment_id IS NOT NULL
          AND source_appointment_updated_at IS NOT NULL
          AND source_starts_at IS NOT NULL
          AND source_ends_at > source_starts_at
          AND source_status IN ('scheduled', 'confirmed')
          AND starts_at IS NULL
          AND ends_at IS NULL
          AND site_id IS NULL
          AND visit_type_id IS NULL
        )
      )
    SQL
      name: "clinic_patient_portal_appointment_requests_values"
  end
end
