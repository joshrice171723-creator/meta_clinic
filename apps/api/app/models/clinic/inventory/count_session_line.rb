module Clinic
  module Inventory
    class CountSessionLine < ApplicationRecord
      self.table_name = "clinic_inventory_count_session_lines"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :count_session, class_name: "Clinic::Inventory::CountSession"
      belongs_to :batch, class_name: "Clinic::Inventory::PharmacyBatch"
      has_many :counts, class_name: "Clinic::Inventory::Count", foreign_key: :count_session_line_id, dependent: :restrict_with_error
      has_many :events, class_name: "Clinic::Inventory::CountSessionEvent", foreign_key: :count_session_line_id, dependent: :restrict_with_error
    end
  end
end
