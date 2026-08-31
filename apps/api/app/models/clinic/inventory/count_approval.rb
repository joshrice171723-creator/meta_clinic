module Clinic
  module Inventory
    class CountApproval < ApplicationRecord
      self.table_name = "clinic_inventory_count_approvals"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :count, class_name: "Clinic::Inventory::Count"
      belongs_to :actor, class_name: "User"
      belongs_to :entry, class_name: "Clinic::Inventory::Entry", optional: true
      belongs_to :profile, class_name: "Clinic::Inventory::Profile", optional: true
    end
  end
end
