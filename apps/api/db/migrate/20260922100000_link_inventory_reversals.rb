class LinkInventoryReversals < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_inventory_entries, :reverses_entry_id, :bigint
    add_index :clinic_inventory_entries, [ :practice_id, :reverses_entry_id ], unique: true,
      where: "reverses_entry_id IS NOT NULL", name: "index_inventory_entries_unique_reversal"
    add_foreign_key :clinic_inventory_entries, :clinic_inventory_entries,
      column: [ :practice_id, :reverses_entry_id ], primary_key: [ :practice_id, :id ],
      name: "fk_inventory_entries_reversed_entry"
    add_check_constraint :clinic_inventory_entries, "reverses_entry_id IS NULL OR reverses_entry_id <> id",
      name: "inventory_entry_no_self_reversal"
  end
end
