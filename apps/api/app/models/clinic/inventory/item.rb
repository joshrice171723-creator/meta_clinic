module Clinic
  module Inventory
    class Item < ApplicationRecord
      self.table_name = "clinic_items"
      belongs_to :practice, class_name: "Clinic::Practice"
      has_many :stock_movements, class_name: "Clinic::Inventory::StockMovement", dependent: :restrict_with_error
      validates :name, presence: true, length: { maximum: 120 }
      validates :sku, presence: true, length: { maximum: 40 }, uniqueness: { scope: :practice_id }
      validates :quantity, :reorder_level, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 1_000_000 }

      def adjust!(delta:, reason:, actor:, request_key:)
        amount = Integer(delta.to_s, 10)
        raise ArgumentError, "Use a nonzero whole-number adjustment between -1000000 and 1000000." unless amount != 0 && amount.abs <= 1_000_000
        Clinic::Inventory::Access.with(practice_id, actor, "adjust") do |profile|
          Clinic::Inventory::Access.retry_lock(practice_id, request_key)
          with_lock do
            existing = stock_movements.find_by(request_key: request_key)
            if existing
              raise ArgumentError, "This form was already used for a different adjustment." unless existing.quantity == amount && existing.reason == reason && existing.actor_id == actor.id
              return existing
            end
            raise ArgumentError, "Stock cannot be negative or exceed 1,000,000." unless (quantity + amount).between?(0, 1_000_000)
            entry = stock_movements.create!(practice_id: practice_id, quantity: amount, stock_unit: "each", kind: "office_adjustment", reason: reason, actor: actor, profile_id: profile.id, request_key: request_key, occurred_at: Time.current)
            reload
            entry
          end
        end
      end
    end
  end
end
