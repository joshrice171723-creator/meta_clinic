class AddInventoryLocationAddresses < ActiveRecord::Migration[8.1]
  def change
    change_table :clinic_inventory_locations, bulk: true do |table|
      table.string :address_line1
      table.string :address_line2
      table.string :city
      table.string :state
      table.string :postal_code
      table.string :country, null: false, default: "US"
    end

    add_column :clinic_inventory_purchase_orders, :destination_address, :text
  end
end
