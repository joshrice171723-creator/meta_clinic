module Clinic
  module Care
    class PatientContact < ApplicationRecord
      self.table_name = "clinic_patient_contacts"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :patient, class_name: "Clinic::Care::Patient"

      enum :contact_type, { phone: "phone", email: "email" }, prefix: true, validate: true
      encrypts :contact_value
      validates :patient_id, :contact_type, :contact_value, :effective_from, presence: true
      validates :contact_value, length: { maximum: 320 }
      validates :preferred, inclusion: { in: [ true, false ] }
      validates :effective_until, comparison: { greater_than: :effective_from }, allow_nil: true
    end
  end
end
