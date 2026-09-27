module Clinic
  module Inventory
    class PurchaseOrder < ApplicationRecord
      self.table_name = "clinic_inventory_purchase_orders"
      STATUSES = %w[draft submitted approved rejected sent partially_received complete cancelled].freeze
      include Clinic::TenantScoped
      include Clinic::Auditable
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

      # PaperTrail exposes a `version` helper, so make this workflow's
      # optimistic version column explicit like the other versioned models.
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
          raise ArgumentError, "Choose a supplier before recording a sent purchase order." if to == "sent" && supplier_id.nil?
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
