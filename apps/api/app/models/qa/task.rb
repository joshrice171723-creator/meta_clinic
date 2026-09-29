module Qa
  class Task < ApplicationRecord
    self.table_name = "qa_tasks"
    KINDS = %w[qa_run retest issue_report question repair fixture_reset].freeze
    belongs_to :user
    belongs_to :claimed_by, class_name: "User", optional: true
    validates :kind, inclusion: { in: KINDS }
    validates :recipient, inclusion: { in: %w[muse codex] }
    validates :status, inclusion: { in: %w[queued claimed completed failed cancelled] }
    validates :request_key, :title, presence: true
    validates :title, length: { maximum: 200 }
  end
end
