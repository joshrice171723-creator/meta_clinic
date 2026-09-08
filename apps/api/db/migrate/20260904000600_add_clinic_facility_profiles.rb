class AddClinicFacilityProfiles < ActiveRecord::Migration[8.1]
  def change
    change_table :clinic_sites, bulk: true do |table|
      table.string :name
      table.string :status, null: false, default: "draft"
      table.string :address_line1
      table.string :address_line2
      table.string :city
      table.string :state
      table.string :postal_code
      table.string :country, null: false, default: "US"
      table.string :phone
      table.string :contact_name
      table.string :contact_email
    end
    execute "UPDATE clinic_sites SET name = code WHERE name IS NULL"
    add_check_constraint :clinic_sites,
      "status IN ('draft','active','temporarily_closed','retired')",
      name: "clinic_sites_status"

    create_table :clinic_site_operating_hours do |table|
      table.bigint :practice_id, null: false
      table.bigint :site_id, null: false
      table.integer :day_of_week, null: false
      table.boolean :closed, null: false, default: false
      table.time :open_time
      table.time :close_time
      table.timestamps
    end
    add_index :clinic_site_operating_hours, [ :practice_id, :site_id, :day_of_week ],
      unique: true, name: "clinic_site_hours_identity"
    add_foreign_key :clinic_site_operating_hours, :clinic_practices,
      column: :practice_id, name: "fk_clinic_site_hours_practice"
    add_foreign_key :clinic_site_operating_hours, :clinic_sites,
      column: [ :practice_id, :site_id ], primary_key: [ :practice_id, :id ],
      name: "fk_clinic_site_hours_site"
    add_check_constraint :clinic_site_operating_hours,
      "day_of_week BETWEEN 0 AND 6 AND ((closed = true AND open_time IS NULL AND close_time IS NULL) OR (closed = false AND open_time IS NOT NULL AND close_time IS NOT NULL AND open_time < close_time))",
      name: "clinic_site_hours_values"

    create_table :clinic_site_hour_exceptions do |table|
      table.bigint :practice_id, null: false
      table.bigint :site_id, null: false
      table.date :date, null: false
      table.boolean :closed, null: false, default: false
      table.time :open_time
      table.time :close_time
      table.string :reason
      table.timestamps
    end
    add_index :clinic_site_hour_exceptions, [ :practice_id, :site_id, :date ],
      unique: true, name: "clinic_site_hour_exceptions_identity"
    add_foreign_key :clinic_site_hour_exceptions, :clinic_practices,
      column: :practice_id, name: "fk_clinic_site_exceptions_practice"
    add_foreign_key :clinic_site_hour_exceptions, :clinic_sites,
      column: [ :practice_id, :site_id ], primary_key: [ :practice_id, :id ],
      name: "fk_clinic_site_exceptions_site"
    add_check_constraint :clinic_site_hour_exceptions,
      "((closed = true AND open_time IS NULL AND close_time IS NULL) OR (closed = false AND open_time IS NOT NULL AND close_time IS NOT NULL AND open_time < close_time)) AND (reason IS NULL OR length(trim(reason)) <= 200)",
      name: "clinic_site_hour_exceptions_values"

    add_column :clinic_inventory_purchase_orders, :receiving_site_id, :bigint
    add_foreign_key :clinic_inventory_purchase_orders, :clinic_sites,
      column: [ :practice_id, :receiving_site_id ], primary_key: [ :practice_id, :id ],
      name: "fk_inventory_purchase_orders_receiving_site"
    add_index :clinic_inventory_purchase_orders, [ :practice_id, :receiving_site_id ],
      name: "inventory_purchase_orders_receiving_site"
  end
end
