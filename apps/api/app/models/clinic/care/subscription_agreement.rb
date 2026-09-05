module Clinic
  module Care
    class SubscriptionAgreement < ApplicationRecord
      self.table_name = "clinic_subscription_agreements"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :package_version, class_name: "Clinic::Care::SubscriptionVersion", foreign_key: :version_id
      belongs_to :invoice, class_name: "Clinic::Invoice"
      has_many :events, class_name: "Clinic::Care::SubscriptionEvent", foreign_key: :agreement_id

      def current_state(at: Time.current)
        latest = events.order(id: :desc).first
        return "pending_payment" unless latest
        return "expired" if latest.kind == "active" && Time.iso8601(latest.details.fetch("ends_at")) <= at
        return "active" if latest.kind == "canceled" && Time.iso8601(latest.details.fetch("effective_at")) > at
        latest.kind
      end
    end
  end
end
