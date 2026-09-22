class CreateClinicServiceOfferings < ActiveRecord::Migration[8.0]
  def change
    create_table :clinic_service_offerings do |t|
      t.bigint :practice_id, null: false
      t.string :name, null: false, limit: 160
      t.string :code, limit: 50
      t.string :description, limit: 500
      t.bigint :visit_type_id
      t.bigint :billing_service_id
      t.integer :duration_minutes
      t.string :modality, null: false, default: "in_person", limit: 16
      t.boolean :booking_required, null: false, default: true
      t.boolean :requires_room, null: false, default: false
      t.string :status, null: false, default: "draft", limit: 16
      t.datetime :published_at
      t.datetime :retired_at
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end

    add_index :clinic_service_offerings, [ :practice_id, :id ], unique: true,
      name: "clinic_service_offerings_practice_id"
    add_index :clinic_service_offerings, [ :practice_id, :name ],
      name: "clinic_service_offerings_name"
    add_index :clinic_service_offerings, [ :practice_id, :code ], unique: true,
      where: "code IS NOT NULL", name: "clinic_service_offerings_code"
    add_index :clinic_service_offerings, [ :practice_id, :status ],
      name: "clinic_service_offerings_status"
    add_foreign_key :clinic_service_offerings, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_service_offerings, :clinic_visit_types,
      column: [ :practice_id, :visit_type_id ], primary_key: [ :practice_id, :id ],
      name: "fk_service_offerings_visit_type"
    add_foreign_key :clinic_service_offerings, :clinic_billing_services,
      column: [ :practice_id, :billing_service_id ], primary_key: [ :practice_id, :id ],
      name: "fk_service_offerings_billing_service"
    add_check_constraint :clinic_service_offerings,
      "length(trim(name)) > 0 AND modality IN ('in_person','video','either') AND status IN ('draft','published','retired') AND lock_version >= 0",
      name: "clinic_service_offerings_values"
    add_check_constraint :clinic_service_offerings,
      "duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 1440",
      name: "clinic_service_offerings_duration"
    add_check_constraint :clinic_service_offerings,
      "code IS NULL OR length(trim(code)) > 0",
      name: "clinic_service_offerings_code_value"

    create_table :clinic_service_offering_sites do |t|
      t.bigint :practice_id, null: false
      t.bigint :service_offering_id, null: false
      t.bigint :site_id, null: false
      t.timestamps
    end

    add_index :clinic_service_offering_sites, [ :practice_id, :service_offering_id, :site_id ], unique: true,
      name: "clinic_service_offering_sites_unique"
    add_index :clinic_service_offering_sites, [ :practice_id, :site_id, :service_offering_id ],
      name: "clinic_service_offering_sites_site"
    add_foreign_key :clinic_service_offering_sites, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_service_offering_sites, :clinic_service_offerings,
      column: [ :practice_id, :service_offering_id ], primary_key: [ :practice_id, :id ],
      name: "fk_service_offering_sites_offering"
    add_foreign_key :clinic_service_offering_sites, :clinic_sites,
      column: [ :practice_id, :site_id ], primary_key: [ :practice_id, :id ],
      name: "fk_service_offering_sites_site"
  end
end
