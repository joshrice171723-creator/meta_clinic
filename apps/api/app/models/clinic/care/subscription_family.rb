module Clinic
  module Care
    class SubscriptionFamily < ApplicationRecord
      self.table_name = "clinic_subscription_families"
      include Clinic::TenantScoped
      include Clinic::Auditable
      validates :name, presence: true, length: { maximum: 160 }
      validates :description, length: { maximum: 4000 }
    end
  end
end
