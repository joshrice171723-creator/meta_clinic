module Clinic
  module Inventory
    class PharmacyBatchEvent < ApplicationRecord
      self.table_name = "clinic_pharmacy_batch_events"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :batch, class_name: "Clinic::Inventory::PharmacyBatch"
      belongs_to :actor, class_name: "User"
      validates :reason, presence: true, length: { maximum: 200 }
      validates :request_key, presence: true, format: { with: /\A[0-9a-f-]{36}\z/ }
      validates :from_status, :to_status, inclusion: { in: %w[active quarantined recalled] }
      before_update { throw :abort }
      before_destroy { throw :abort }
    end
  end
end
