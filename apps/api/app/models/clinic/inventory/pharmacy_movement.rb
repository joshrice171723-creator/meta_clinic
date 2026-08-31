module Clinic
  module Inventory
    class PharmacyMovement < Entry
      default_scope { where(stock_type: "pharmacy") }
      KINDS = { "receipt" => 1, "adjustment_in" => 1, "adjustment_out" => -1, "damaged" => -1, "expired" => -1, "return_to_supplier" => -1 }.freeze
      belongs_to :batch, class_name: "Clinic::Inventory::PharmacyBatch"
      belongs_to :receipt_line, class_name: "Clinic::Inventory::ReceiptLine", optional: true
    end
  end
end
