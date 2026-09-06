module Clinic
  module Care
    class SubscriptionFamily < ApplicationRecord
      self.table_name = "clinic_subscription_families"
      include Clinic::TenantScoped
      include Clinic::Auditable
      validates :name, presence: true, length: { maximum: 160 }
      validates :description, length: { maximum: 4000 }
      validates :display_order, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 1_000_000 }
    end
  end
end
