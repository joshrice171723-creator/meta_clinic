module Clinic
  module Care
    class SubscriptionEntitlementEntry < ApplicationRecord
      self.table_name = "clinic_subscription_entitlement_entries"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :agreement, class_name: "Clinic::Care::SubscriptionAgreement"
      belongs_to :service_option, class_name: "Clinic::Care::ServiceOption", foreign_key: :service_id
      belongs_to :actor, class_name: "User"
      belongs_to :reversed_entry, class_name: name, optional: true

      validates :kind, inclusion: { in: %w[opening use reversal] }
      validates :quantity, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 10000 }
      validates :request_key, :source_reference, presence: true, length: { maximum: 160 }
    end
  end
end
