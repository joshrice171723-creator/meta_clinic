require "digest"

module Qa
  class ServiceToken < ApplicationRecord
    self.table_name = "qa_service_tokens"
    belongs_to :user
    validates :name, :digest, presence: true
    validates :recipient, inclusion: { in: %w[muse codex] }
    validates :scope, inclusion: { in: %w[qa office] }

    def office? = scope == "office"

    def self.authenticate(raw)
      return unless raw.to_s.match?(/\Aqa_[A-Za-z0-9_-]{43}\z/)
      token = includes(:user).find_by(digest: Digest::SHA256.hexdigest(raw), revoked_at: nil)
      return unless token && token.user.active? && token.user.platform_owner?
      token.update_columns(last_used_at: Time.current)
      token
    end
  end
end
