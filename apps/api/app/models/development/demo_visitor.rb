module Development
  class DemoVisitor < ApplicationRecord
    self.table_name = "development_demo_visitors"

    normalizes :name, :company, with: ->(value) { value.strip }
    normalizes :email, with: ->(value) { value.strip.downcase }
    validates :name, presence: true, length: { maximum: 160 }
    validates :company, presence: true, length: { maximum: 200 }
    validates :email, presence: true, length: { maximum: 254 }, format: { with: URI::MailTo::EMAIL_REGEXP }
    validates :clinic_name, length: { maximum: 160 }, allow_blank: true
    has_many :demo_runs, class_name: "Development::DemoRun", foreign_key: :visitor_id,
      inverse_of: :visitor, dependent: :restrict_with_error
    has_many :demo_feedback, class_name: "Development::DemoFeedback", foreign_key: :visitor_id,
      inverse_of: :visitor, dependent: :restrict_with_error
  end
end
