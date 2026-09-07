class CreateMedicationAdministrations < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_medication_administrations do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :site_id, null: false
      t.bigint :administered_by_membership_id, null: false
      t.bigint :product_id, null: false
      t.text :dose_text, null: false
      t.text :route_text, null: false
      t.text :administration_site_text
      t.decimal :quantity, precision: 12, scale: 6, null: false
      t.string :stock_unit, null: false, limit: 20
      t.column :administered_at, "timestamp(6) with time zone", null: false
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.string :request_key, null: false, limit: 160
      t.timestamps
    end
    add_index :clinic_medication_administrations, %i[practice_id id], unique: true,
      name: "clinic_medication_administrations_practice_id"
    add_index :clinic_medication_administrations, %i[practice_id patient_id encounter_id administered_at id],
      name: "clinic_medication_administrations_encounter_timeline"
    add_index :clinic_medication_administrations, %i[practice_id request_key], unique: true,
      name: "clinic_medication_administrations_retry"
    add_foreign_key :clinic_medication_administrations, :clinic_practices, column: :practice_id,
      name: "fk_medication_administrations_practice"
    add_foreign_key :clinic_medication_administrations, :clinic_patients,
      column: %i[practice_id patient_id], primary_key: %i[practice_id id],
      name: "fk_medication_administrations_patient"
    add_foreign_key :clinic_medication_administrations, :clinic_encounters,
      column: %i[practice_id patient_id encounter_id], primary_key: %i[practice_id patient_id id],
      name: "fk_medication_administrations_encounter"
    add_foreign_key :clinic_medication_administrations, :clinic_sites,
      column: %i[practice_id site_id], primary_key: %i[practice_id id],
      name: "fk_medication_administrations_site"
    add_foreign_key :clinic_medication_administrations, :clinic_memberships,
      column: %i[practice_id administered_by_membership_id], primary_key: %i[practice_id id],
      name: "fk_medication_administrations_actor"
    add_foreign_key :clinic_medication_administrations, :clinic_pharmacy_products,
      column: %i[practice_id product_id], primary_key: %i[practice_id id],
      name: "fk_medication_administrations_product"
    add_check_constraint :clinic_medication_administrations,
      "quantity > 0 AND quantity <= 1000000 AND quantity = round(quantity, 6)",
      name: "clinic_medication_administrations_quantity"
    add_check_constraint :clinic_medication_administrations,
      "stock_unit IN ('package','each','tablet','capsule','vial','mL','g')",
      name: "clinic_medication_administrations_stock_unit"
    add_check_constraint :clinic_medication_administrations,
      "administered_at <= recorded_at",
      name: "clinic_medication_administrations_timeline"
    add_check_constraint :clinic_medication_administrations,
      "length(trim(dose_text)) > 0 AND length(trim(route_text)) > 0 AND " \
      "length(request_key) BETWEEN 1 AND 160",
      name: "clinic_medication_administrations_values"

    create_table :clinic_medication_administration_movements do |t|
      t.bigint :practice_id, null: false
      t.bigint :medication_administration_id, null: false
      t.bigint :inventory_entry_id, null: false
      t.timestamps
    end
    add_index :clinic_medication_administration_movements, %i[practice_id id], unique: true,
      name: "clinic_medication_admin_movements_practice_id"
    add_index :clinic_medication_administration_movements,
      %i[practice_id medication_administration_id inventory_entry_id], unique: true,
      name: "clinic_medication_admin_movements_identity"
    add_index :clinic_medication_administration_movements, %i[practice_id inventory_entry_id], unique: true,
      name: "clinic_medication_admin_movements_entry"
    add_foreign_key :clinic_medication_administration_movements, :clinic_practices, column: :practice_id,
      name: "fk_medication_admin_movements_practice"
    add_foreign_key :clinic_medication_administration_movements, :clinic_medication_administrations,
      column: %i[practice_id medication_administration_id], primary_key: %i[practice_id id],
      name: "fk_medication_admin_movements_administration"
    add_foreign_key :clinic_medication_administration_movements, :clinic_inventory_entries,
      column: %i[practice_id inventory_entry_id], primary_key: %i[practice_id id],
      name: "fk_medication_admin_movements_entry"

    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE TRIGGER clinic_medication_administrations_immutable
          BEFORE UPDATE OR DELETE ON clinic_medication_administrations
          FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
          CREATE TRIGGER clinic_medication_administration_movements_immutable
          BEFORE UPDATE OR DELETE ON clinic_medication_administration_movements
          FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER IF EXISTS clinic_medication_administration_movements_immutable ON clinic_medication_administration_movements"
        execute "DROP TRIGGER IF EXISTS clinic_medication_administrations_immutable ON clinic_medication_administrations"
      end
    end
  end
end
