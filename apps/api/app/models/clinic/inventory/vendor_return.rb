module Clinic
  module Inventory
    class VendorReturn < ApplicationRecord
      self.table_name = "clinic_inventory_vendor_returns"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :purchase_order, class_name: "Clinic::Inventory::PurchaseOrder"
      belongs_to :actor, class_name: "User"
      validates :reference, presence: true, length: { maximum: 160 }
      validates :reason, presence: true, length: { maximum: 200 }
    end
  end
end
