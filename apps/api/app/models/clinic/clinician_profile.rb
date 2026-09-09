module Clinic
  class ClinicianProfile < ApplicationRecord
    self.table_name = "clinic_clinician_profiles"
    include TenantScoped
    include Auditable

    belongs_to :membership, class_name: "Clinic::Membership"
    has_many :assignments, class_name: "Clinic::ClinicianAssignment", dependent: :restrict_with_error
    has_many :credentials, class_name: "Clinic::ClinicianCredential", dependent: :restrict_with_error
    has_many :booked_appointments, class_name: "Clinic::Appointment", foreign_key: :booked_clinician_id, dependent: :restrict_with_error
    encrypts :display_name

    validates :membership_id, uniqueness: { scope: :practice_id }
    validate :membership_belongs_to_practice
    validates :display_name, length: { maximum: 120 }, allow_nil: true
    validates :reference, length: { maximum: 32 }, uniqueness: { scope: :practice_id }, allow_nil: true

    private

    def membership_belongs_to_practice
      errors.add(:membership, "must belong to this practice") if membership && membership.practice_id != practice_id
    end
  end
end
