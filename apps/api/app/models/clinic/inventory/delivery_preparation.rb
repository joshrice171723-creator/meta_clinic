module Clinic
  module Inventory
    class DeliveryPreparation < ApplicationRecord
      self.table_name = "clinic_inventory_delivery_preparations"
      include Clinic::TenantScoped
      belongs_to :purchase_order, class_name: "Clinic::Inventory::PurchaseOrder"
      belongs_to :actor, class_name: "User"
      validates :reason, presence: true, length: { maximum: 200 }
      validates :status, inclusion: { in: [ "prepared" ] }
      validates :connection_status, inclusion: { in: [ "disconnected" ] }
      validates :delivery_outcome, inclusion: { in: [ "unknown" ] }
      validates :source, inclusion: { in: [ "local_preparation" ] }
      def readonly? = persisted?
    end
  end
end
