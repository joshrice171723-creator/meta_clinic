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
      has_one :closure, class_name: "Clinic::Inventory::RecallClosure", foreign_key: :recall_id, dependent: :restrict_with_error

      scope :open_cases, -> {
        where.not(status: "closed").where(<<~SQL.squish)
          NOT EXISTS (
            SELECT 1 FROM clinic_inventory_recall_closures closure
            WHERE closure.practice_id=clinic_inventory_recalls.practice_id
              AND closure.recall_id=clinic_inventory_recalls.id
          )
        SQL
      }
    end
  end
end
