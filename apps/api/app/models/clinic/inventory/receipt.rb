module Clinic
  module Inventory
    class Receipt < ApplicationRecord
      self.table_name = "clinic_inventory_receipts"
      belongs_to :supplier, class_name: "Clinic::Inventory::Supplier", optional: true
      has_many :lines, class_name: "Clinic::Inventory::ReceiptLine", foreign_key: :receipt_id
      validates :reason, presence: true, length: { maximum: 200 }
      validates :invoice_reference, length: { maximum: 160 }
    end
  end
end
