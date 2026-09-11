class User < ApplicationRecord
  has_secure_password
  DUMMY_PASSWORD_DIGEST = BCrypt::Password.create(SecureRandom.hex(24)).to_s.freeze
  normalizes :email_address, with: ->(email) { email.strip.downcase }
  has_many :member_sessions, dependent: :destroy
  has_one :preference, class_name: "Identity::Preference", dependent: :destroy
  has_one :clinic_membership, class_name: "Clinic::Membership", dependent: :restrict_with_error
  has_many :platform_clinic_invitations, class_name: "Clinic::Workforce::EmployeeInvitation",
    foreign_key: :invited_by_platform_user_id, dependent: :restrict_with_error, inverse_of: :invited_by_platform_user
  has_many :paperworks, class_name: "Launch::Paperwork", dependent: :restrict_with_error
  has_many :learning_progresses, class_name: "Launch::LearningProgress", dependent: :destroy
  validates :email_address, presence: true, uniqueness: true, length: { maximum: 254 },
    format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :password, length: { minimum: 12 }, if: -> { new_record? || password.present? }
  after_update :revoke_sessions, if: -> { saved_change_to_password_digest? || saved_change_to_active? }

  def platform_owner_access?
    platform_owner? || (Rails.env.development? && admin? &&
      Development::TestAccounts.reserved_email?(email_address))
  end

  private

  def revoke_sessions
    Identity::SessionAudit.record!(action: "sessions.revoked_credentials_changed", user_id: id) if member_sessions.exists?
    member_sessions.delete_all
    Clinic::Telehealth::RevokeMembershipAccess.for_user(user: self, force: true,
      reason: saved_change_to_password_digest? ? "credentials_changed" : "account_access_revoked")
  end
end
