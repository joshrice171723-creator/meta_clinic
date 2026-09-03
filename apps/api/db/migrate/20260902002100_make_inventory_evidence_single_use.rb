class MakeInventoryEvidenceSingleUse < ActiveRecord::Migration[8.1]
  def change
    add_index :clinic_inventory_entries, %i[transfer_id kind], unique: true,
      where: "transfer_id IS NOT NULL", name: "inventory_entry_transfer_once"
    add_index :clinic_inventory_entries, :recall_disposition_id, unique: true,
      where: "recall_disposition_id IS NOT NULL", name: "inventory_entry_disposition_once"
    add_index :clinic_inventory_holds, :transfer_id, unique: true,
      where: "transfer_id IS NOT NULL", name: "inventory_hold_transfer_once"
    add_index :clinic_inventory_holds, %i[recall_id batch_id], unique: true,
      where: "recall_id IS NOT NULL", name: "inventory_hold_recall_batch_once"
  end
end
