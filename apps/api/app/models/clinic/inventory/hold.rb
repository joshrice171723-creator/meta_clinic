module Clinic
  module Inventory
    class Hold < ApplicationRecord
      self.table_name = "clinic_inventory_holds"
      include Clinic::TenantScoped
      include Clinic::Auditable
      belongs_to :batch, class_name: "Clinic::Inventory::PharmacyBatch"
      belongs_to :actor, class_name: "User", optional: true
      belongs_to :profile, class_name: "Clinic::Inventory::Profile", optional: true
      belongs_to :transfer, class_name: "Clinic::Inventory::Transfer", optional: true
      belongs_to :recall, class_name: "Clinic::Inventory::Recall", optional: true
      has_one :release, class_name: "Clinic::Inventory::HoldRelease", foreign_key: :hold_id, dependent: :restrict_with_error
      scope :active, -> { where("NOT EXISTS (SELECT 1 FROM clinic_inventory_hold_releases r WHERE r.hold_id=clinic_inventory_holds.id)") }
      validates :reason, presence: true, length: { maximum: 200 }
      validates :kind, inclusion: { in: %w[quarantined recalled temperature damaged] }
    end
  end
end
