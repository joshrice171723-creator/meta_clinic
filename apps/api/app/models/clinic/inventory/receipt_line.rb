module Clinic
  module Inventory
    class ReceiptLine < ApplicationRecord
      self.table_name = "clinic_inventory_receipt_lines"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :receipt, class_name: "Clinic::Inventory::Receipt"
      belongs_to :batch, class_name: "Clinic::Inventory::PharmacyBatch"
      belongs_to :purchase_order_line, class_name: "Clinic::Inventory::PurchaseOrderLine", optional: true
      has_one :entry, class_name: "Clinic::Inventory::Entry", foreign_key: :receipt_line_id, dependent: :restrict_with_error
    end
  end
end
