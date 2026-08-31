module Launch
  class Paperwork < ApplicationRecord
    self.table_name = "paperworks"
    CONSENT_VERSION = "demo-signing-v1".freeze
    class SigningConflict < StandardError; end

    belongs_to :user
    encrypts :body, :signature_name
    validates :title, :body, :document_version, :content_digest, presence: true
    validates :title, length: { maximum: 200 }
    validates :signature_name, length: { maximum: 120 }, allow_nil: true
    before_validation :set_content_digest, on: :create
    validate :document_snapshot_is_immutable, on: :update
    before_destroy { throw :abort }
    scope :available_in_portal, -> { DemoContent.enabled? ? all : where(demo: false) }

    def status
      return "completed" if signed_at?
      started_at? ? "started" : "not_started"
    end

    def begin_review!
      with_lock { update!(started_at: Time.current) unless started_at? }
    end

    def sign!(name:, reviewed_digest:)
      raise SigningConflict, "Signing is not enabled in production." unless DemoContent.enabled?
      with_lock do
        raise SigningConflict, "This document is already completed." if signed_at?
        raise SigningConflict, "Begin reviewing this document before signing." unless started_at?
        raise SigningConflict, "The document version changed. Reload and review it again." unless reviewed_digest == content_digest
        raise SigningConflict, "Only demonstration documents can be signed in this prototype." unless demo?
        timestamp = Time.current
        signature = name.to_s.strip
        raise SigningConflict, "Enter a demonstration name (2–120 characters)." unless signature.length.between?(2, 120)
        evidence = [ id, user_id, content_digest, timestamp.iso8601(6), signature, CONSENT_VERSION ].to_json
        update!(signed_at: timestamp, signature_name: signature, consent_version: CONSENT_VERSION,
          signature_digest: Digest::SHA256.hexdigest(evidence))
      end
    end

    def portal_json(detail: false)
      result = as_json(only: %i[id title document_version demo started_at signed_at])
        .merge("status" => status)
      result.merge!(as_json(only: %i[body content_digest signature_name signature_digest consent_version])) if detail
      result
    end

    def self.assign_demo!(user)
      raise SigningConflict, "Demo content is disabled in production." unless DemoContent.enabled?
      user.paperworks.create!(
        title: "Your portal walkthrough",
        document_version: "demo-v1", demo: true,
        body: "DEMONSTRATION DOCUMENT — NOT REQUIRED CLINIC PAPERWORK\n\nThis sample lets you try the APPly review and signing workflow. It is not a contract, government application, clinical document, or legal agreement. Nothing is submitted to an institution.\n\n1. Read this sample document.\n2. Begin your review to change its status to Started.\n3. Use a fictional name and confirm your intent to sign. Regular accounts also confirm their password; the local development walkthrough does not require one.\n\nCompleting this sample demonstrates the interface only. APPly will separately assign the actual reviewed paperwork for your launch when it is ready."
      )
    end

    private

    def set_content_digest
      self.content_digest = Digest::SHA256.hexdigest([ title, document_version, body ].to_json)
    end

    def document_snapshot_is_immutable
      immutable = %w[user_id title document_version body content_digest demo]
      immutable += %w[started_at signed_at signature_name signature_digest consent_version] if signed_at_in_database
      errors.add(:base, "Assigned document and completed signature records cannot be overwritten.") if immutable.any? { |key| will_save_change_to_attribute?(key) }
    end
  end
end
