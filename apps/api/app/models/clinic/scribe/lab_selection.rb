module Clinic
  module Scribe
    class LabSelection < ApplicationRecord
      self.table_name = "clinic_scribe_lab_selections"
      include TenantScoped
      include Auditable

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Scribe::Encounter"
      belongs_to :lab_report_version, class_name: "Clinic::Care::LabReportVersion"
      belongs_to :selected_by, class_name: "User"

      validates :selected_at, presence: true
      validates :lab_report_version_id, uniqueness: { scope: %i[practice_id encounter_id] }
      validate :records_share_patient_context

      private

      def records_share_patient_context
        { encounter: encounter, lab_report_version: lab_report_version }.each do |attribute, record|
          errors.add(attribute, "must belong to the selected practice") if record && record.practice_id != practice_id
          errors.add(attribute, "must belong to the selected patient") if record && record.patient_id != patient_id
        end
      end
    end
  end
end
