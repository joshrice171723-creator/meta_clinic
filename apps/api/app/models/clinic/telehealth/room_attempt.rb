module Clinic
  module Telehealth
    class RoomAttempt < ApplicationRecord
      self.table_name = "clinic_telehealth_room_attempts"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :visit, class_name: "Clinic::Telehealth::Visit"
      has_many :join_grants, class_name: "Clinic::Telehealth::JoinGrant", dependent: :restrict_with_error
      has_many :commands, class_name: "Clinic::Telehealth::Command", dependent: :restrict_with_error
      has_many :provider_events, class_name: "Clinic::Telehealth::ProviderEvent", dependent: :restrict_with_error
      encrypts :provider_room_url

      enum :status, { pending: "pending", provisioning: "provisioning", ready: "ready", active: "active",
        ending: "ending", ended: "ended", failed: "failed", unknown: "unknown" }, validate: true
      validates :attempt_no, :access_generation, numericality: { only_integer: true, greater_than: 0 }
      validates :provider_code, inclusion: { in: %w[daily twilio] }
      validates :provider_account_ref, :provider_room_name, :expires_at, presence: true
      validates :provider_room_ref, length: { maximum: 64 }, allow_nil: true
    end
  end
end
