module Clinic
  class ClinicalTaskDependency < ApplicationRecord
    self.table_name = "clinic_clinical_task_dependencies"
    include TenantScoped
    include Auditable
    belongs_to :task, class_name: "Clinic::ClinicalTask"
    belongs_to :prerequisite, class_name: "Clinic::ClinicalTask"
    validate :context_matches

    private

    def context_matches
      return unless task && prerequisite

      if task.practice_id != practice_id || prerequisite.practice_id != practice_id ||
          task.patient_id != prerequisite.patient_id || task_id == prerequisite_id
        errors.add(:base, "Dependencies must reference different tasks for the same patient and clinic")
      end
    end
  end
end
