module Clinic
  module Inventory
    class Entry < ApplicationRecord
      self.table_name = "clinic_inventory_entries"
      belongs_to :actor, class_name: "User", optional: true
      belongs_to :profile, class_name: "Clinic::Inventory::Profile", optional: true
      validates :reason, presence: true, length: { maximum: 200 }
      validates :request_key, presence: true, length: { maximum: 100 }
      validates :quantity, numericality: { other_than: 0 }
      before_update { throw :abort }
      before_destroy { throw :abort }
    end
  end
end
