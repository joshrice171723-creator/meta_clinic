module Clinic
  module Telehealth
    class ProviderEvent < ApplicationRecord
      self.table_name = "clinic_telehealth_provider_events"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :room_attempt, class_name: "Clinic::Telehealth::RoomAttempt"
      belongs_to :participant, class_name: "Clinic::Telehealth::Participant", optional: true
      validates :provider_code, inclusion: { in: %w[daily] }
      validates :provider_account_ref, :provider_event_id, :event_type, :occurred_at, :received_at, presence: true
      validates :payload_digest, format: { with: /\A\h{64}\z/ }
    end
  end
end
