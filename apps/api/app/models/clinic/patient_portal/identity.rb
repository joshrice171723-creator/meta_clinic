require "digest"

module Clinic
  module PatientPortal
    class Identity < ApplicationRecord
      self.table_name = "clinic_patient_portal_identities"
      include Clinic::TenantScoped
      include Clinic::Auditable

      INVITATION_TTL = 30.minutes
      TERMS_VERSION = "patient-portal-terms-v1"

      enum :status, { invited: "invited", active: "active", revoked: "revoked" }, validate: true

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :user
      has_many :telehealth_participants, class_name: "Clinic::Telehealth::Participant", foreign_key: :portal_identity_id,
        dependent: :restrict_with_error

      validates :patient_id, :user_id, :invited_at, presence: true
      validates :activated_at, presence: true, if: :active?
      validates :revoked_at, presence: true, if: :revoked?
      validates :invitation_digest, format: { with: /\A\h{64}\z/ }, presence: true, if: :invited?
      validates :invitation_expires_at, presence: true, if: :invited?
      validate :patient_belongs_to_practice
      after_update :revoke_telehealth_access, if: -> { saved_change_to_status? && revoked? }

      scope :available, -> { where(status: :active) }

      def self.digest_token(token)
        Digest::SHA256.hexdigest(token.to_s)
      end

      private

      def patient_belongs_to_practice
        return unless patient && practice_id
        errors.add(:patient, "must belong to this practice") unless patient.practice_id == practice_id
      end

      def revoke_telehealth_access
        return unless defined?(Clinic::Telehealth::RevokeMembershipAccess)

        Clinic::Telehealth::RevokeMembershipAccess.for_user(
          user: user, reason: "portal_identity_revoked", force: false, now: Time.current
        )
      end
    end
  end
end
