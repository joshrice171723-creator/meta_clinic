class AllowExpiredAppointmentRequests < ActiveRecord::Migration[8.1]
  def up
    remove_check_constraint :clinic_patient_portal_appointment_requests,
      name: "clinic_patient_portal_appointment_requests_values"
    add_check_constraint :clinic_patient_portal_appointment_requests, <<~SQL.squish,
      request_kind IN ('new_booking', 'reschedule', 'cancel')
      AND status IN ('pending', 'approved', 'declined', 'cancelled', 'expired')
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

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Expired appointment-request outcomes are retained as audit history."
  end
end
