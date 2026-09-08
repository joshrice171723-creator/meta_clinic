module Clinic
  module Telehealth
    class JoinGrant < ApplicationRecord
      self.table_name = "clinic_telehealth_join_grants"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :visit, class_name: "Clinic::Telehealth::Visit"
      belongs_to :participant, class_name: "Clinic::Telehealth::Participant"
      belongs_to :room_attempt, class_name: "Clinic::Telehealth::RoomAttempt"
      validates :access_generation, numericality: { only_integer: true, greater_than: 0 }
      validates :token_digest, format: { with: /\A\h{64}\z/ }, uniqueness: true
      validates :request_digest, format: { with: /\A\h{64}\z/ }
      validates :issued_at, :expires_at, presence: true

      def active?(at = Time.current)
        revoked_at.nil? && expires_at > at
      end
    end
  end
end
