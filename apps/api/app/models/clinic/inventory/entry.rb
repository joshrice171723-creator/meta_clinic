module Clinic
  module Inventory
    class Entry < ApplicationRecord
      self.table_name = "clinic_inventory_entries"
      include Clinic::TenantScoped
      has_one :count_approval, class_name: "Clinic::Inventory::CountApproval", foreign_key: :entry_id, dependent: :restrict_with_error
      belongs_to :actor, class_name: "User", optional: true
      belongs_to :profile, class_name: "Clinic::Inventory::Profile", optional: true
      belongs_to :item, class_name: "Clinic::Inventory::Item", optional: true
      belongs_to :batch, class_name: "Clinic::Inventory::PharmacyBatch", optional: true
      belongs_to :receipt_line, class_name: "Clinic::Inventory::ReceiptLine", optional: true
      belongs_to :count, class_name: "Clinic::Inventory::Count", optional: true
      belongs_to :transfer, class_name: "Clinic::Inventory::Transfer", optional: true
      belongs_to :recall_disposition, class_name: "Clinic::Inventory::RecallDisposition", optional: true
      belongs_to :reversed_entry, class_name: "Clinic::Inventory::Entry", foreign_key: :reverses_entry_id, optional: true
      has_one :reversal, class_name: "Clinic::Inventory::Entry", foreign_key: :reverses_entry_id, dependent: :restrict_with_error
      has_one :medication_administration_movement,
        class_name: "Clinic::Care::MedicationAdministrationMovement",
        foreign_key: :inventory_entry_id,
        dependent: :restrict_with_error
      validates :reason, presence: true, length: { maximum: 200 }
      validates :request_key, presence: true, length: { maximum: 100 }
      validates :quantity, numericality: { other_than: 0 }
      before_update { throw :abort }
      before_destroy { throw :abort }
    end
  end
end
