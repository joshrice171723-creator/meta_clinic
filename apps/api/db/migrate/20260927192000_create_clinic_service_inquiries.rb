class CreateClinicServiceInquiries < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_service_inquiries do |t|
      t.bigint :practice_id, null: false
      t.bigint :service_offering_id, null: false
      t.string :request_key, null: false, limit: 160
      t.string :request_digest, null: false, limit: 64
      t.text :display_name, null: false
      t.text :email_address
      t.text :phone_number
      t.column :outreach_consent_at, "timestamp(6) with time zone", null: false
      t.string :status, null: false, default: "new", limit: 24
      t.bigint :lock_version, null: false, default: 0
      t.timestamps
    end

    add_index :clinic_service_inquiries, %i[practice_id id], unique: true,
      name: "clinic_service_inquiries_practice_id"
    add_index :clinic_service_inquiries, %i[practice_id request_key], unique: true,
      name: "clinic_service_inquiries_request_key"
    add_index :clinic_service_inquiries, %i[practice_id status created_at id],
      name: "clinic_service_inquiries_queue"
    add_foreign_key :clinic_service_inquiries, :clinic_practices,
      column: :practice_id, name: "fk_service_inquiries_practice"
    add_foreign_key :clinic_service_inquiries, :clinic_service_offerings,
      column: %i[practice_id service_offering_id], primary_key: %i[practice_id id],
      name: "fk_service_inquiries_offering"
    add_check_constraint :clinic_service_inquiries,
      "status IN ('new','contacted','closed') AND lock_version >= 0 AND " \
      "request_digest ~ '^[0-9a-f]{64}$' AND char_length(trim(request_key)) BETWEEN 1 AND 160",
      name: "clinic_service_inquiries_values"
  end
end
