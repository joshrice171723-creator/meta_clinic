module Clinic
  module Inventory
    class HoldRelease < ApplicationRecord
      self.table_name = "clinic_inventory_hold_releases"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :hold, class_name: "Clinic::Inventory::Hold"
      belongs_to :actor, class_name: "User"
      belongs_to :profile, class_name: "Clinic::Inventory::Profile", optional: true
      validates :reason, presence: true, length: { maximum: 200 }
    end
  end
end
