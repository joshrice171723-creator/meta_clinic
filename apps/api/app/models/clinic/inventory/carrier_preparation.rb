module Clinic
  module Inventory
    class CarrierPreparation < ApplicationRecord
      self.table_name = "clinic_inventory_carrier_preparations"
      include Clinic::TenantScoped
      belongs_to :shipment, class_name: "Clinic::Inventory::Shipment"
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
