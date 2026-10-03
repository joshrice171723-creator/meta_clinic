require "base64"
require "digest"
require "openssl"

module Qa
  class MuseCredential < ApplicationRecord
    self.table_name = "qa_muse_credentials"

    SCOPES = %w[
      qa.workflow.claim
      qa.verdict.write
      qa.defect.write
      qa.test_data.prepare
      qa.retest.request
    ].freeze

    belongs_to :user
    belongs_to :approved_by, class_name: "User"

    validates :identity, inclusion: { in: %w[muse] }
    validates :fingerprint, :public_key_pem, presence: true
    validate :exact_scopes

    scope :active, -> { where(revoked_at: nil) }

    def scope?(scope)
      scopes == SCOPES && scopes.include?(scope)
    end

    def usable?
      revoked_at.nil? && user.active? && user.platform_owner?
    end

    def public_key
      OpenSSL::PKey.read(public_key_pem)
    end

    def self.fingerprint_for(public_key)
      key = public_key.is_a?(String) ? OpenSSL::PKey.read(public_key) : public_key
      raise ArgumentError, "An Ed25519 public key is required." unless key.oid == "ED25519"

      "SHA256:#{Base64.urlsafe_encode64(Digest::SHA256.digest(key.public_to_der), padding: false)}"
    rescue OpenSSL::PKey::PKeyError
      raise ArgumentError, "An Ed25519 public key is required."
    end

    private

    def exact_scopes
      errors.add(:scopes, "must be the five approved Muse QA scopes") unless scopes == SCOPES
    end
  end
end
