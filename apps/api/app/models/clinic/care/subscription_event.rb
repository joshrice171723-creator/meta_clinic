module Clinic
  module Care
    class SubscriptionEvent < ApplicationRecord
      self.table_name = "clinic_subscription_events"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :agreement, class_name: "Clinic::Care::SubscriptionAgreement"
      validates :request_key, :kind, presence: true
    end
  end
end
