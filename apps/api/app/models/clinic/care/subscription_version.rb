module Clinic
  module Care
    class SubscriptionVersion < ApplicationRecord
      self.table_name = "clinic_subscription_versions"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :package, class_name: "Clinic::Care::SubscriptionPackage"
      validates :number, numericality: { only_integer: true, greater_than: 0 }
      validates :request_key, :request_digest, presence: true
    end
  end
end
