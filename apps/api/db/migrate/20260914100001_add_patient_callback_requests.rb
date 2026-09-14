class AddPatientCallbackRequests < ActiveRecord::Migration[8.1]
  def up
    remove_check_constraint :clinic_patient_portal_requests, name: "clinic_patient_portal_requests_values"
    add_check_constraint :clinic_patient_portal_requests,
      "request_type IN ('message','refill','callback') AND status IN ('pending','in_review','resolved','declined') AND length(trim(content_digest)) > 0",
      name: "clinic_patient_portal_requests_values"
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Preserve recorded callback requests with a forward migration."
  end
end
