module Clinic
  module Inventory
    class Lot < ApplicationRecord
      self.table_name = "clinic_inventory_lots"
      include Clinic::TenantScoped
      include Clinic::Auditable
      belongs_to :product, class_name: "Clinic::Inventory::PharmacyProduct"
      has_many :batches, class_name: "Clinic::Inventory::PharmacyBatch", foreign_key: :lot_id, dependent: :restrict_with_error
      validates :number, presence: true, length: { maximum: 100 }
      validates :expires_on, presence: true
      validates :expiry_precision, inclusion: { in: %w[day month] }
    end
  end
end
