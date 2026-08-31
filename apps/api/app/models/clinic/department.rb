module Clinic
  class Department < ApplicationRecord
    self.table_name = "clinic_departments"
    include TenantScoped
    include Auditable

    has_many :clinician_assignments, class_name: "Clinic::ClinicianAssignment", dependent: :restrict_with_error

    validates :code, presence: true, length: { maximum: 80 }, uniqueness: { scope: :practice_id }
  end
end
