module Clinic
  module Inventory
    class RecallClosure < ApplicationRecord
      self.table_name = "clinic_inventory_recall_closures"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :recall, class_name: "Clinic::Inventory::Recall"
      belongs_to :actor, class_name: "User"
      belongs_to :profile, class_name: "Clinic::Inventory::Profile"

      validates :reason, presence: true, length: { maximum: 200 }
      validates :evidence_reference, presence: true, length: { maximum: 200 }
    end
  end
end
