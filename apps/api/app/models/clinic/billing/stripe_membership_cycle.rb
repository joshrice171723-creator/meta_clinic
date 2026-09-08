module Clinic
  module Billing
    class StripeMembershipCycle < ApplicationRecord
      self.table_name = "clinic_stripe_membership_cycles"
      include TenantScoped
      include AppendOnly
      belongs_to :checkout, class_name: "Clinic::Billing::StripeCheckout"
      belongs_to :invoice, class_name: "Clinic::Invoice"
    end
  end
end
