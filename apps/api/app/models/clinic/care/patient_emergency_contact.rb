module Clinic
  module Care
    class PatientEmergencyContact < ApplicationRecord
      self.table_name = "clinic_patient_emergency_contacts"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :patient, class_name: "Clinic::Care::Patient"

      encrypts :name, :phone
      validates :patient_id, :name, :relationship, :phone, :effective_from, presence: true
      validates :name, :relationship, :phone, length: { maximum: 320 }
      validates :permission_to_contact, inclusion: { in: [ true, false ] }
      validates :effective_until, comparison: { greater_than: :effective_from }, allow_nil: true
    end
  end
end
