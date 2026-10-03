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

    SSH_PREFIX = [11].pack("N") + "ssh-ed25519" + [32].pack("N")

    def self.public_key_for(value)
      raise ArgumentError, "Paste a public Ed25519 key." unless value.is_a?(String) && value.bytesize <= 2000 && !value.include?("PRIVATE KEY")
      text = value.strip
      if text.start_with?("ssh-ed25519 ")
        wire = Base64.strict_decode64(text.split(/\s+/)[1])
        raise ArgumentError, "Invalid Ed25519 public key." unless wire.bytesize == SSH_PREFIX.bytesize + 32 && wire.start_with?(SSH_PREFIX)
        der = OpenSSL::ASN1::Sequence.new([OpenSSL::ASN1::Sequence.new([OpenSSL::ASN1::ObjectId.new("1.3.101.112")]), OpenSSL::ASN1::BitString.new(wire.byteslice(SSH_PREFIX.bytesize, 32))]).to_der
        key = OpenSSL::PKey.read(der)
      else
        raise ArgumentError, "Paste an ssh-ed25519 or PUBLIC KEY PEM." unless text.start_with?("-----BEGIN PUBLIC KEY-----")
        key = OpenSSL::PKey.read(text)
      end
      raise ArgumentError, "An Ed25519 public key is required." unless key.oid == "ED25519"
      key
    rescue OpenSSL::PKey::PKeyError
      raise ArgumentError, "An Ed25519 public key is required."
    end

    def self.fingerprint_for(public_key)
      key = public_key.is_a?(String) ? public_key_for(public_key) : public_key
      raise ArgumentError, "An Ed25519 public key is required." unless key.oid == "ED25519"
      raw = OpenSSL::ASN1.decode(key.public_to_der).value.fetch(1).value
      raise ArgumentError, "Invalid Ed25519 public key." unless raw.bytesize == 32
      "SHA256:#{Base64.strict_encode64(Digest::SHA256.digest(SSH_PREFIX + raw)).delete('=')}"
    end

    private

    def exact_scopes
      errors.add(:scopes, "must be the five approved Muse QA scopes") unless scopes == SCOPES
    end
  end
end
