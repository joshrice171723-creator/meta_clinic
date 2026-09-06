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
      validate :destination_belongs_to_practice

      def with_draft_lock
        self.class.transaction do
          locked_practice = Clinic::Practice.lock("FOR SHARE").find(practice_id)
          locked_actor = User.lock("FOR SHARE").find(actor_id)
          with_lock do
            Authorization.authorize!(actor: locked_actor, practice: locked_practice, action: "procurement.create")
            raise ArgumentError, "This cart is no longer editable. Reload the cart." unless status == "draft"
            yield
            update!(version: version + 1)
          end
        end
      end

      def self.active_for(practice:, actor:)
        find_or_create_by!(practice_id: practice.id, actor_id: actor.id, status: "draft")
      end

      private

      def destination_belongs_to_practice
        if destination_site && destination_site.practice_id != practice_id
          errors.add(:destination_site, "must belong to this clinic")
        end
      end
    end
  end
end
