module Clinic
  module Care
    class PatientCommunicationPreference < ApplicationRecord
      self.table_name = "clinic_patient_communication_preferences"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :patient, class_name: "Clinic::Care::Patient"

      enum :preferred_contact_method, { text: "text", phone: "phone", email: "email", portal: "portal" }, prefix: true, validate: true
      validates :patient_id, presence: true, uniqueness: { scope: :practice_id }
      validates :preferred_contact_method, presence: true
      validates :appointment_reminders_consent, :general_communications_consent, inclusion: { in: [ true, false ] }
    end
  end
end
