class BindEachShipmentToOneOrderLine < ActiveRecord::Migration[8.1]
  def up
    remove_index :clinic_inventory_shipment_lines, name: "inventory_shipment_line_identity"
    add_index :clinic_inventory_shipment_lines, [ :practice_id, :shipment_id ], unique: true,
      name: "inventory_shipment_line_identity"
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Shipment allocation evidence remains bound to its recorded order line."
  end
end
