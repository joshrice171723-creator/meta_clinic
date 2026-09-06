module Clinic
  module Billing
    class StripeConnection < ApplicationRecord
      self.table_name = "clinic_stripe_connections"
      include TenantScoped
      include Auditable
      belongs_to :connected_by, class_name: "User"
      validates :reference, presence: true, uniqueness: true
      validates :account_id, format: { with: /\Aacct_[a-zA-Z0-9]+\z/ }, allow_nil: true
    end
  end
end
