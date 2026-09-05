module Clinic
  module Inventory
    class PurchaseCart < ApplicationRecord
      self.table_name = "clinic_inventory_purchase_carts"
      STATUSES = %w[draft checking_out checked_out abandoned].freeze
      include Clinic::TenantScoped

      belongs_to :actor, class_name: "User"
      belongs_to :destination_site, class_name: "Clinic::Site", optional: true
      has_many :items, class_name: "Clinic::Inventory::PurchaseCartItem", foreign_key: :cart_id, dependent: :restrict_with_error
      has_many :purchase_orders, class_name: "Clinic::Inventory::PurchaseOrder", foreign_key: :purchase_cart_id, dependent: :restrict_with_error

      validates :status, inclusion: { in: STATUSES }
      validates :reason, length: { maximum: 200 }, allow_blank: true

      def self.active_for(practice:, actor:)
        find_or_create_by!(practice_id: practice.id, actor_id: actor.id, status: "draft")
      end
    end
  end
end
