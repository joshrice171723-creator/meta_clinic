module Clinic
  module Inventory
    class Recall < ApplicationRecord
      self.table_name = "clinic_inventory_recalls"
      include Clinic::TenantScoped
      include Clinic::Auditable
      belongs_to :product, class_name: "Clinic::Inventory::PharmacyProduct"
      belongs_to :actor, class_name: "User"
      has_many :recall_lots, class_name: "Clinic::Inventory::RecallLot", foreign_key: :recall_id, dependent: :restrict_with_error
      has_many :lots, through: :recall_lots
      has_many :dispositions, class_name: "Clinic::Inventory::RecallDisposition", foreign_key: :recall_id, dependent: :restrict_with_error
    end
  end
end
