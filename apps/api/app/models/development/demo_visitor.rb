module Development
  class DemoVisitor < ApplicationRecord
    self.table_name = "development_demo_visitors"

    normalizes :name, :company, with: ->(value) { value.strip }
    normalizes :email, with: ->(value) { value.strip.downcase }
    validates :name, presence: true, length: { maximum: 160 }
    validates :company, presence: true, length: { maximum: 200 }
    validates :email, presence: true, length: { maximum: 254 }, format: { with: URI::MailTo::EMAIL_REGEXP }
  end
end
