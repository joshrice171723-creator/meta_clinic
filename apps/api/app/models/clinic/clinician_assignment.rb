module Clinic
  class ClinicianAssignment < ApplicationRecord
    self.table_name = "clinic_clinician_assignments"
    include TenantScoped
    include Auditable

    belongs_to :clinician_profile, class_name: "Clinic::ClinicianProfile"
    belongs_to :department, class_name: "Clinic::Department"
    belongs_to :site, class_name: "Clinic::Site"

    scope :current, ->(at = Time.current) { where("effective_from <= ? AND (effective_until IS NULL OR effective_until > ?)", at, at) }

    validates :effective_from, presence: true
    validate :valid_effective_window
    validate :related_records_belong_to_practice

    private

    def valid_effective_window
      errors.add(:effective_until, "must be after effective_from") if effective_until && effective_from && effective_until <= effective_from
    end

    def related_records_belong_to_practice
      { clinician_profile: clinician_profile, department: department, site: site }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
      end
    end
  end
end
