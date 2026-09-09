class IndexInventoryWorklists < ActiveRecord::Migration[8.1]
  def change
    add_index :clinic_inventory_holds, [ :batch_id, :id ]
    add_index :clinic_inventory_counts, [ :batch_id, :id ]
    add_index :clinic_inventory_receipt_lines, [ :batch_id, :id ]
    add_index :clinic_pharmacy_batches, [ :practice_id, :expires_on, :id ], name: "inventory_expiry_worklist"
  end
end
