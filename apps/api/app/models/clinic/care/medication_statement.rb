module Clinic
  module Care
    class MedicationStatement < ApplicationRecord
      self.table_name = "clinic_medication_statements"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      validates :patient_id, presence: true
    end
  end
end
