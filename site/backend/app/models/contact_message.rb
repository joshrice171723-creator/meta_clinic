class ContactMessage < ApplicationRecord
  encrypts :name, :email, :message
  normalizes :email, with: ->(email) { email.strip.downcase }
  normalizes :name, :message, with: ->(value) { value.strip }
  validates :name, presence: true, length: { maximum: 100 }
  validates :email, presence: true, length: { maximum: 254 }, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :message, length: { minimum: 10, maximum: 4000 }
end
