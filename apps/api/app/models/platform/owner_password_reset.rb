require "digest"

module Platform
  class OwnerPasswordReset < ApplicationRecord
    self.table_name = "platform_owner_password_resets"

    RESET_TTL = 30.minutes

    belongs_to :user

    scope :pending, -> { where(used_at: nil, revoked_at: nil) }

    validates :token_digest, format: { with: /\A\h{64}\z/ }, presence: true, if: :pending?
    validates :requested_at, :expires_at, presence: true
    validate :terminal_state

    def self.digest(value)
      Digest::SHA256.hexdigest(value.to_s)
    end

    def pending?
      used_at.nil? && revoked_at.nil?
    end

    private

    def terminal_state
      return unless used_at && revoked_at

      errors.add(:base, "cannot be used and revoked")
    end
  end
end
