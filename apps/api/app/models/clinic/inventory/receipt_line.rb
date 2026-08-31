module Clinic
  module Inventory
    class ReceiptLine < ApplicationRecord
      self.table_name = "clinic_inventory_receipt_lines"
      belongs_to :receipt, class_name: "Clinic::Inventory::Receipt"
      belongs_to :batch, class_name: "Clinic::Inventory::PharmacyBatch"
    end
  end
end
