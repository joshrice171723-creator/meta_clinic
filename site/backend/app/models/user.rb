class User < ApplicationRecord
  has_secure_password
  DUMMY_PASSWORD_DIGEST = BCrypt::Password.create(SecureRandom.hex(24)).to_s.freeze
  normalizes :email_address, with: ->(email) { email.strip.downcase }
  has_many :member_sessions, dependent: :destroy
  has_one :clinic_membership, class_name: "Clinic::Membership", dependent: :restrict_with_error
  has_many :paperworks, dependent: :restrict_with_error
  has_many :learning_progresses, dependent: :destroy
  validates :email_address, presence: true, uniqueness: true, length: { maximum: 254 },
    format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :password, length: { minimum: 12 }, if: -> { new_record? || password.present? }
  after_update :revoke_sessions, if: -> { saved_change_to_password_digest? || saved_change_to_active? }

  private

  def revoke_sessions
    member_sessions.delete_all
  end
end
