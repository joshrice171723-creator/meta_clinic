module Clinic
  module Inventory
    class Shipment < ApplicationRecord
      self.table_name = "clinic_inventory_shipments"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :purchase_order, class_name: "Clinic::Inventory::PurchaseOrder"
      belongs_to :actor, class_name: "User"
      has_many :receipts, class_name: "Clinic::Inventory::Receipt", foreign_key: :shipment_id, dependent: :restrict_with_error
      has_many :shipment_lines, class_name: "Clinic::Inventory::ShipmentLine", foreign_key: :shipment_id, dependent: :restrict_with_error
      has_many :shipment_events, -> { order(:recorded_at, :id) }, class_name: "Clinic::Inventory::ShipmentEvent",
        foreign_key: :shipment_id, dependent: :restrict_with_error
      has_one :reconciliation, class_name: "Clinic::Inventory::ShipmentReconciliation", foreign_key: :shipment_id, dependent: :restrict_with_error

      validates :carrier, length: { maximum: 80 }, allow_blank: true
      validates :tracking_number, length: { maximum: 120 }, allow_blank: true

      def effective_status
        return "reconciled_with_discrepancy" if reconciliation
        return "received" if receipts.exists?

        shipment_events.order(recorded_at: :desc, id: :desc).pick(:status) || status
      end

      def effective_delivered_at
        shipment_events.reverse.find { |event| event.status == "delivered" }&.recorded_at || delivered_at
      end

      def allowed_next_statuses
        Clinic::Inventory::ShipmentEvent::TRANSITIONS.fetch(effective_status, [])
      end
    end
  end
end
