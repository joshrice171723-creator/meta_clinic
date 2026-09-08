module Clinic
  class ClinicianCredential < ApplicationRecord
    self.table_name = "clinic_clinician_credentials"
    include TenantScoped
    include Auditable

    belongs_to :clinician_profile, class_name: "Clinic::ClinicianProfile"

    validates :credential_type, :jurisdiction, :issuer_reference, :review_status, presence: true, length: { maximum: 160 }
    validate :profile_belongs_to_practice

    private

    def profile_belongs_to_practice
      errors.add(:clinician_profile, "must belong to this practice") if clinician_profile && clinician_profile.practice_id != practice_id
    end
  end
end
