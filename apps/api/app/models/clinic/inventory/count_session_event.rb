module Clinic
  module Inventory
    class CountSessionEvent < ApplicationRecord
      self.table_name = "clinic_inventory_count_session_events"
      KINDS = %w[observed skipped resumed reassigned completed cancelled].freeze

      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :count_session, class_name: "Clinic::Inventory::CountSession"
      belongs_to :count_session_line, class_name: "Clinic::Inventory::CountSessionLine", optional: true
      belongs_to :count, class_name: "Clinic::Inventory::Count", optional: true
      belongs_to :actor, class_name: "User"
      belongs_to :assignee, class_name: "User", optional: true

      validates :kind, inclusion: { in: KINDS }
      validates :reason, presence: true, length: { maximum: 200 }
      validates :request_key, presence: true, length: { maximum: 100 }
      validates :payload_digest, format: { with: /\A[0-9a-f]{64}\z/ }
    end
  end
end
