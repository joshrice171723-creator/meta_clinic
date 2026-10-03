module Qa
  class Evidence < ApplicationRecord
    self.table_name = "qa_evidence"
    belongs_to :user
    validates :issue_number, numericality: { only_integer: true, greater_than: 0 }, allow_nil: true
    validate do
      errors.add(:workflow_ids, "must identify canonical workflows when no issue is supplied") unless workflow_ids.is_a?(Array) &&
        workflow_ids.uniq == workflow_ids && (workflow_ids - WorkflowContract::IDS).empty? && (issue_number.present? || workflow_ids.present?)
    end
    validates :caption, presence: true, length: { maximum: 500 }
    validates :revision, format: { with: /\A[0-9a-f]{40}\z/ }
    validates :content_type, inclusion: { in: %w[image/png image/jpeg] }
    validates :phase, inclusion: { in: %w[before after observation] }
    def readonly? = persisted?
  end
end
