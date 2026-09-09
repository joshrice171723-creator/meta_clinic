module Clinic
  module Inventory
    module ItemSerializer
      def self.call(item)
        {
          id: item.id,
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          reorder_level: item.reorder_level
        }
      end
    end
  end
end
