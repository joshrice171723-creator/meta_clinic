module Clinic
  module Inventory
    class Receipt < ApplicationRecord
      self.table_name = "clinic_inventory_receipts"
      include Clinic::TenantScoped
      include Clinic::Auditable
      belongs_to :actor, class_name: "User"
      belongs_to :profile, class_name: "Clinic::Inventory::Profile"
      belongs_to :supplier, class_name: "Clinic::Inventory::Supplier", optional: true
      has_many :lines, class_name: "Clinic::Inventory::ReceiptLine", foreign_key: :receipt_id, dependent: :restrict_with_error
      validates :reason, presence: true, length: { maximum: 200 }
      validates :invoice_reference, length: { maximum: 160 }
    end
  end
end
