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
      validate :approver_is_not_counter

      private

      def approver_is_not_counter
        errors.add(:actor, "must differ from the counter") if count && count.actor_id == actor_id
      end
    end
  end
end
