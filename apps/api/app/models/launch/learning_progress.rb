module Launch
  class LearningProgress < ApplicationRecord
    self.table_name = "learning_progresses"
    belongs_to :user
    belongs_to :material

    def status
      completed_at? ? "completed" : "started"
    end
  end
end
