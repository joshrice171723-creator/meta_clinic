module Clinic
  module Care
    class PatientContact < ApplicationRecord
      self.table_name = "clinic_patient_contacts"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      has_many :patient_portal_recovery_deliveries, class_name: "Clinic::PatientPortal::RecoveryDelivery",
        dependent: :restrict_with_error

      enum :contact_type, { phone: "phone", email: "email" }, prefix: true, validate: true
      encrypts :contact_value
      validates :patient_id, :contact_type, :contact_value, :effective_from, presence: true
      validates :contact_value, length: { maximum: 320 }
      validates :preferred, inclusion: { in: [ true, false ] }
      validates :effective_until, comparison: { greater_than: :effective_from }, allow_nil: true
      validate :contact_value_matches_type

      after_save -> { Clinic::Care::PatientIdentitySearch.refresh!(patient) }

      private

      def contact_value_matches_type
        case contact_type
        when "email"
          errors.add(:contact_value, "must be a valid email address") unless URI::MailTo::EMAIL_REGEXP.match?(contact_value.to_s)
        when "phone"
          errors.add(:contact_value, "must be a valid phone number") unless contact_value.to_s.scan(/\d/).length.between?(7, 15)
        end
      end
    end
  end
end
