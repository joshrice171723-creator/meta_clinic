class MakeShipmentReceiptsSingleUse < ActiveRecord::Migration[8.1]
  def change
    add_index :clinic_inventory_receipts, [ :practice_id, :shipment_id ], unique: true,
      where: "shipment_id IS NOT NULL", name: "inventory_receipt_shipment_once"
  end
end
