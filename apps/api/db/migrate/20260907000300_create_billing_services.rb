class CreateBillingServices < ActiveRecord::Migration[8.0]
  def change
    create_table :clinic_billing_services do |t|
      t.bigint :practice_id, null: false
      t.string :name, null: false, limit: 160
      t.string :code, limit: 50
      t.string :description, limit: 500
      t.decimal :unit_amount, precision: 14, scale: 2, null: false
      t.string :currency, null: false, limit: 3
      t.boolean :active, null: false, default: true
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end

    add_index :clinic_billing_services, [ :practice_id, :id ], unique: true,
      name: "clinic_billing_services_practice_id"
    add_index :clinic_billing_services, [ :practice_id, :name ],
      name: "clinic_billing_services_name"
    add_index :clinic_billing_services, [ :practice_id, :code ], unique: true,
      where: "code IS NOT NULL", name: "clinic_billing_services_code"
    add_foreign_key :clinic_billing_services, :clinic_practices, column: :practice_id
    add_check_constraint :clinic_billing_services,
      "length(trim(name)) > 0 AND unit_amount >= 0 AND currency ~ '^[A-Z]{3}$' AND lock_version >= 0",
      name: "clinic_billing_services_values"
    add_check_constraint :clinic_billing_services,
      "code IS NULL OR length(trim(code)) > 0",
      name: "clinic_billing_services_code_value"

    add_column :clinic_invoice_lines, :billing_service_id, :bigint
    add_index :clinic_invoice_lines, [ :practice_id, :billing_service_id ],
      name: "clinic_invoice_lines_billing_service"
    add_foreign_key :clinic_invoice_lines, :clinic_billing_services,
      column: [ :practice_id, :billing_service_id ], primary_key: [ :practice_id, :id ],
      name: "fk_invoice_lines_billing_service"
  end
end
