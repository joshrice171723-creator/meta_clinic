module Clinic
  module Care
    class SubscriptionPackage < ApplicationRecord
      self.table_name = "clinic_subscription_packages"
      include Clinic::TenantScoped
      include Clinic::Auditable
      belongs_to :family, class_name: "Clinic::Care::SubscriptionFamily"
      belongs_to :published_version, class_name: "Clinic::Care::SubscriptionVersion", optional: true
      has_many :published_versions, class_name: "Clinic::Care::SubscriptionVersion", foreign_key: :package_id
      validates :name, presence: true, length: { maximum: 160 }
    end
  end
end
