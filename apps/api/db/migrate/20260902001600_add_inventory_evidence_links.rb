class AddInventoryEvidenceLinks < ActiveRecord::Migration[8.1]
  def change
    add_reference :clinic_inventory_entries, :transfer, foreign_key: { to_table: :clinic_inventory_transfers }
    add_reference :clinic_inventory_entries, :recall_disposition, foreign_key: { to_table: :clinic_inventory_recall_dispositions }
    add_reference :clinic_inventory_holds, :transfer, foreign_key: { to_table: :clinic_inventory_transfers }
    add_reference :clinic_inventory_holds, :recall, foreign_key: { to_table: :clinic_inventory_recalls }
  end
end
