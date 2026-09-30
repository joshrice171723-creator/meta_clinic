module Clinic
  module Care
    class SubscriptionAllowanceEntry < ApplicationRecord
      self.table_name = "clinic_subscription_allowance_entries"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :agreement, class_name: "Clinic::Care::SubscriptionAgreement"
      belongs_to :paid_event, class_name: "Clinic::Care::SubscriptionEvent"
      belongs_to :actor, class_name: "User"
      belongs_to :reversed_entry, class_name: name, optional: true
    end
  end
end
