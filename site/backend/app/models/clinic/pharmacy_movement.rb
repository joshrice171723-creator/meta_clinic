module Clinic
  class PharmacyMovement < ApplicationRecord
    self.table_name = "clinic_pharmacy_movements"
    KINDS = { "receipt" => 1, "adjustment_in" => 1, "adjustment_out" => -1, "damaged" => -1, "expired" => -1, "return_to_supplier" => -1 }.freeze
    belongs_to :batch, class_name: "Clinic::PharmacyBatch"
    belongs_to :actor, class_name: "User"
    validates :reason, presence: true, length: { maximum: 200 }
    validates :request_key, presence: true, format: { with: /\A[0-9a-f-]{36}\z/ }
    validates :kind, inclusion: { in: KINDS.keys }
    validates :quantity, numericality: { only_integer: true, other_than: 0 }
    before_update { throw :abort }
    before_destroy { throw :abort }
  end
end
