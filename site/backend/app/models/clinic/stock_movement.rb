module Clinic
  class StockMovement < ApplicationRecord
    self.table_name = "clinic_stock_movements"
    belongs_to :item, class_name: "Clinic::Item"
    belongs_to :actor, class_name: "User"
    validates :reason, presence: true, length: { maximum: 200 }
    validates :request_key, presence: true, length: { maximum: 64 }
    before_update { throw :abort }
    before_destroy { throw :abort }
  end
end
