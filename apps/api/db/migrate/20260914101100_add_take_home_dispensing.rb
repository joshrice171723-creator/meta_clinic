class AddTakeHomeDispensing < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_medication_dispenses do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :site_id, null: false
      t.bigint :medication_request_revision_id, null: false
      t.bigint :recorded_by_membership_id, null: false
      t.bigint :original_dispense_id
      t.bigint :inventory_entry_id
      t.string :status, null: false
      t.string :request_key, null: false
      t.string :stock_unit, null: false
      t.decimal :quantity, precision: 18, scale: 6, null: false
      t.text :reason
      t.datetime :handed_over_at, null: false
      t.datetime :recorded_at, null: false
    end
    add_index :clinic_medication_dispenses, %i[practice_id request_key], unique: true
    add_index :clinic_medication_dispenses, :original_dispense_id, unique: true
    { practice_id: :clinic_practices, patient_id: :clinic_patients, encounter_id: :clinic_encounters,
      site_id: :clinic_sites, medication_request_revision_id: :clinic_medication_request_revisions,
      recorded_by_membership_id: :clinic_memberships, inventory_entry_id: :clinic_inventory_entries,
      original_dispense_id: :clinic_medication_dispenses }.each do |column, table|
      add_foreign_key :clinic_medication_dispenses, table, column:
    end
    add_check_constraint :clinic_medication_dispenses,
      "(status = 'handed_over' AND quantity > 0 AND inventory_entry_id IS NOT NULL AND original_dispense_id IS NULL) OR " \
      "(status = 'reversed' AND quantity < 0 AND inventory_entry_id IS NOT NULL AND original_dispense_id IS NOT NULL) OR " \
      "(status = 'not_done' AND quantity = 0 AND inventory_entry_id IS NULL AND original_dispense_id IS NULL)", name: "dispense_evidence"
    add_foreign_key :clinic_medication_dispenses, :clinic_medication_request_revisions,
      column: %i[practice_id patient_id encounter_id medication_request_revision_id], primary_key: %i[practice_id patient_id encounter_id id], name: "dispense_order_context"
    add_foreign_key :clinic_medication_dispenses, :clinic_memberships,
      column: %i[practice_id recorded_by_membership_id], primary_key: %i[practice_id id], name: "dispense_actor_tenant"
    add_foreign_key :clinic_medication_dispenses, :clinic_inventory_entries,
      column: %i[practice_id inventory_entry_id], primary_key: %i[practice_id id], name: "dispense_inventory_tenant"
    reversible do |direction|
      direction.up { execute "CREATE TRIGGER medication_dispenses_immutable BEFORE UPDATE OR DELETE ON clinic_medication_dispenses FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()" }
      direction.down { execute "DROP TRIGGER medication_dispenses_immutable ON clinic_medication_dispenses" }
    end
  end
end
