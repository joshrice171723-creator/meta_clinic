module Clinic
  module Inventory
    class StockMovement < Entry
      default_scope { where(stock_type: "office") }
      belongs_to :item, class_name: "Clinic::Inventory::Item"
      alias_attribute :delta, :quantity
    end
  end
end
