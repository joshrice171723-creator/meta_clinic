module Clinic
  module Care
    class LabReportAction < ApplicationRecord
      self.table_name = "clinic_lab_report_actions"
      include Clinic::TenantScoped
      include Clinic::Auditable
      belongs_to :lab_report_version, class_name: "Clinic::Care::LabReportVersion"
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership"
      belongs_to :clinical_task, class_name: "Clinic::ClinicalTask", optional: true
      encrypts :note
      validates :kind, inclusion: { in: %w[acknowledged recollection_requested recollection_completed] }
      validates :request_key, :recorded_at, presence: true
      validates :note, length: { maximum: 1000 }
      validate do
        version = lab_report_version
        unless version && version.practice_id == practice_id && version.patient_id == patient_id && recorded_by_membership&.practice_id == practice_id
          errors.add(:base, "Lab action context mismatch")
        end
        if clinical_task && (clinical_task.practice_id != practice_id || clinical_task.patient_id != patient_id)
          errors.add(:clinical_task, "must belong to this patient and practice")
        end
      end
      before_update { throw :abort }
      before_destroy { throw :abort }
    end
  end
end
