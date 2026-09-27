module Development
  class DemoFeedback < ApplicationRecord
    self.table_name = "development_demo_feedback"

    belongs_to :visitor, class_name: "Development::DemoVisitor", inverse_of: :demo_feedback

    normalizes :message, with: ->(value) { value.strip }
    validates :message, presence: true, length: { maximum: 2000 }
  end
end
