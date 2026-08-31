class LearningProgress < ApplicationRecord
  belongs_to :user
  belongs_to :material

  def status
    completed_at? ? "completed" : "started"
  end
end
