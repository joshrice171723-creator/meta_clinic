module Clinic
  class ClinicalTaskEvent < ApplicationRecord
    self.table_name = "clinic_clinical_task_events"
    include TenantScoped
    include AppendOnly
    belongs_to :task, class_name: "Clinic::ClinicalTask"
    belongs_to :actor_membership, class_name: "Clinic::Membership"
    validates :action, :task_version, :recorded_at, presence: true
    validates :task_version, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
    validate :context_matches

    private

    def context_matches
      errors.add(:base, "Task event must belong to this clinic") if
        [task, actor_membership].compact.any? { |record| record.practice_id != practice_id }
    end
  end
end
