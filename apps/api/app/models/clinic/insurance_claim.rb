module Clinic
  class InsuranceClaim < ApplicationRecord
    self.table_name = "clinic_insurance_claims"
    include TenantScoped
    include AppendOnly

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :invoice, class_name: "Clinic::Invoice"
    belongs_to :coverage_version, class_name: "Clinic::CoverageVersion"

    validate :resources_share_patient_and_practice

    private

    def resources_share_patient_and_practice
      { invoice: invoice, coverage_version: coverage_version }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
        errors.add(attribute, "must belong to this patient") if record && record.patient_id != patient_id
      end
    end
  end
end
