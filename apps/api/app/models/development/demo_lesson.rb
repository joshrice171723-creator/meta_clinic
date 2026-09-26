module Development
  class DemoLesson < ApplicationRecord
    self.table_name = "development_demo_lessons"

    belongs_to :practice, class_name: "Clinic::Practice"
    belongs_to :operator_user, class_name: "User"
    belongs_to :visitor, class_name: "Development::DemoVisitor", optional: true

    validates :lesson_key, presence: true, inclusion: { in: ->(_) { DemoLessonCatalog.lesson_keys } },
      uniqueness: { scope: :visitor_id }
    validates :practice_id, :operator_user_id, uniqueness: true
    validates :generation, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  end
end
