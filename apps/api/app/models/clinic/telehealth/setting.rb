module Clinic
  module Telehealth
    class Setting < ApplicationRecord
      self.table_name = "clinic_telehealth_settings"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :updated_by_membership, class_name: "Clinic::Membership"
      belongs_to :active_policy_version, class_name: "Clinic::Telehealth::PolicyVersion", optional: true
      has_many :policy_versions, class_name: "Clinic::Telehealth::PolicyVersion", foreign_key: :settings_id,
        dependent: :restrict_with_error

      enum :health_status, { not_checked: "not_checked", ready: "ready", degraded: "degraded", unconfigured: "unconfigured" },
        validate: true
      validates :provider_code, inclusion: { in: %w[daily] }
      validates :provider_account_ref, length: { maximum: 128 }, allow_nil: true
    end
  end
end
