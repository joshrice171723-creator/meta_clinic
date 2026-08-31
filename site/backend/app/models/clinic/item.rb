module Clinic
  class Item < ApplicationRecord
    self.table_name = "clinic_items"
    belongs_to :practice, class_name: "Clinic::Practice"
    has_many :stock_movements, class_name: "Clinic::StockMovement", dependent: :restrict_with_error
    validates :name, presence: true, length: { maximum: 120 }
    validates :sku, presence: true, length: { maximum: 40 }, uniqueness: { scope: :practice_id }
    validates :quantity, :reorder_level, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 1_000_000 }

    def adjust!(delta:, reason:, actor:, request_key:)
      amount = Integer(delta.to_s, 10)
      raise ArgumentError, "Use a nonzero whole-number adjustment between -1000000 and 1000000." unless amount != 0 && amount.abs <= 1_000_000
      with_lock do
        return if stock_movements.exists?(request_key: request_key)
        update!(quantity: quantity + amount)
        stock_movements.create!(delta: amount, reason: reason, actor: actor, request_key: request_key)
      end
    end
  end
end
