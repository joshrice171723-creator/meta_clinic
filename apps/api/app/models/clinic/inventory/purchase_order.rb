module Clinic
  module Inventory
    class PurchaseOrder < ApplicationRecord
      self.table_name = "clinic_inventory_purchase_orders"
      STATUSES = %w[draft submitted approved rejected sent partially_received complete cancelled].freeze
      include Clinic::TenantScoped
      include Clinic::Auditable
      # PaperTrail clears its reification helper after an update. Keep that
      # helper separate from the persisted optimistic workflow version.
      self.version_association_name = :paper_trail_version
      attr_accessor :paper_trail_version

      belongs_to :supplier, class_name: "Clinic::Inventory::Supplier", optional: true
      belongs_to :receiving_site, class_name: "Clinic::Site", optional: true
      belongs_to :purchase_cart, class_name: "Clinic::Inventory::PurchaseCart", optional: true
      belongs_to :actor, class_name: "User"
      has_many :lines, class_name: "Clinic::Inventory::PurchaseOrderLine", foreign_key: :purchase_order_id, dependent: :restrict_with_error
      has_many :events, class_name: "Clinic::Inventory::PurchaseOrderEvent", foreign_key: :purchase_order_id, dependent: :restrict_with_error
      has_many :shipments, class_name: "Clinic::Inventory::Shipment", foreign_key: :purchase_order_id, dependent: :restrict_with_error
      has_many :receipts, class_name: "Clinic::Inventory::Receipt", foreign_key: :purchase_order_id, dependent: :restrict_with_error
      validates :number, :destination, :reason, :request_key, :payload_digest, presence: true
      validates :destination_address, length: { maximum: 500 }, allow_blank: true
      validates :status, inclusion: { in: STATUSES }

      # The workflow's public version remains the persisted domain column.
      def version
        self[:version]
      end

      def version=(value)
        self[:version] = value
      end

      def remaining_quantity(line)
        line.ordered_quantity - line.received_quantity
      end

      def transition!(to:, actor:, reason:, request_key:)
        raise ArgumentError, "Choose a supported purchase-order state." unless STATUSES.include?(to)
        action = { "submitted" => "procurement.submit", "approved" => "procurement.approve", "rejected" => "procurement.approve", "sent" => "procurement.submit", "complete" => "procurement.submit", "cancelled" => "procurement.submit" }.fetch(to, "procurement.create")
        Clinic::Authorization.authorize!(actor: actor, practice: practice, action: action)
        with_lock do
          existing = events.find_by(request_key: request_key)
          if existing
            raise ArgumentError, "This purchase-order action was already used for different data." unless existing.to_status == to && existing.reason == reason && existing.actor_id == actor.id
            return existing
          end
          allowed = {
            "draft" => %w[submitted cancelled], "submitted" => %w[approved rejected cancelled],
            "approved" => %w[sent cancelled], "sent" => %w[partially_received complete cancelled],
            "partially_received" => %w[complete cancelled]
          }.fetch(status, [])
          raise ArgumentError, "Purchase order state cannot change from #{status}." unless allowed.include?(to)
          if to == "submitted" && lines.empty?
            raise ArgumentError, "Add at least one order line before submitting this purchase order."
          end
          raise ArgumentError, "Choose a supplier before recording a sent purchase order." if to == "sent" && supplier_id.nil?
          if %w[complete cancelled].include?(to) && shipments.where.not(id: Receipt.where(practice_id: practice_id).where.not(shipment_id: nil).select(:shipment_id))
            .where.not(id: ShipmentReconciliation.where(practice_id: practice_id).select(:shipment_id)).exists?
            raise ArgumentError, "Resolve recorded shipments before closing this purchase order."
          end
          if to == "complete" && (lines.empty? || lines.where("received_quantity < ordered_quantity").exists?)
            raise ArgumentError, "Receive outstanding packages before completing this purchase order."
          end
          from = status
          update!(status: to, version: version + 1)
          events.create!(practice_id: practice_id, actor: actor, from_status: from, to_status: to, reason: reason, request_key: request_key)
        end
      end
    end
  end
end
