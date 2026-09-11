require "digest"

module Platform
  class OwnerInvitation < ApplicationRecord
    self.table_name = "platform_owner_invitations"

    INVITATION_TTL = 72.hours

    enum :status, { pending: "pending", accepted: "accepted", revoked: "revoked" }, validate: true

    encrypts :email_address
    normalizes :email_address, with: ->(email) { email.strip.downcase }

    validates :email_address, presence: true, length: { maximum: 254 },
      format: { with: URI::MailTo::EMAIL_REGEXP }
    validates :email_digest, format: { with: /\A\h{64}\z/ }, presence: true
    validates :token_digest, format: { with: /\A\h{64}\z/ }, presence: true, if: :pending?
    validates :invited_at, :expires_at, presence: true
    validate :state_timestamps
    before_validation :set_email_digest

    def self.digest(value)
      Digest::SHA256.hexdigest(value.to_s)
    end

    private

    def set_email_digest
      self.email_digest = self.class.digest(email_address.to_s.strip.downcase)
    end

    def state_timestamps
      valid = case status
      when "pending"
        token_digest.present? && accepted_at.nil? && revoked_at.nil?
      when "accepted"
        token_digest.nil? && accepted_at.present? && revoked_at.nil?
      when "revoked"
        token_digest.nil? && accepted_at.nil? && revoked_at.present?
      end
      errors.add(:status, "does not match its lifecycle timestamps") unless valid
    end
  end
end
