module Clinic
  class Site < ApplicationRecord
    self.table_name = "clinic_sites"
    include TenantScoped
    include Auditable

    has_many :rooms, class_name: "Clinic::Room", dependent: :restrict_with_error
    has_many :clinician_assignments, class_name: "Clinic::ClinicianAssignment", dependent: :restrict_with_error
    has_many :appointments, class_name: "Clinic::Appointment", dependent: :restrict_with_error
    has_many :encounters, class_name: "Clinic::Encounter", dependent: :restrict_with_error
    has_many :role_grants, class_name: "Clinic::RoleGrant", dependent: :restrict_with_error

    validates :code, presence: true, length: { maximum: 80 }, uniqueness: { scope: :practice_id }
    validates :timezone_override, inclusion: { in: ActiveSupport::TimeZone::MAPPING.values + [ "UTC" ] }, allow_nil: true
  end
end
