module Clinic
  module Inventory
    class CountSession < ApplicationRecord
      self.table_name = "clinic_inventory_count_sessions"
      STATUSES = %w[open completed cancelled].freeze

      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :location, class_name: "Clinic::Inventory::Location"
      belongs_to :actor, class_name: "User"
      belongs_to :assignee, class_name: "User"
      has_many :lines, class_name: "Clinic::Inventory::CountSessionLine", foreign_key: :count_session_id, dependent: :restrict_with_error
      has_many :events, class_name: "Clinic::Inventory::CountSessionEvent", foreign_key: :count_session_id, dependent: :restrict_with_error

      validates :status, inclusion: { in: STATUSES }
      validates :reason, presence: true, length: { maximum: 200 }
      validates :due_on, presence: true
    end
  end
end
