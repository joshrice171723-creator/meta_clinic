module Clinic
  class CommunicationEndpoint < ApplicationRecord
    self.table_name = "clinic_communication_endpoints"
    include TenantScoped
    include AppendOnly

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    has_many :reminders, class_name: "Clinic::PatientReminder", dependent: :restrict_with_error
    encrypts :value

    enum :endpoint_type, { portal: "portal", phone: "phone", email: "email" }, validate: true
    scope :verified, -> { where.not(verified_at: nil).where(invalidated_at: nil) }

    validates :value, :value_digest, :label, presence: true
    validates :value, length: { maximum: 320 }
    validate :patient_belongs_to_practice

    def masked_value
      return "portal session" if portal?
      value.to_s.gsub(/\A(.{2}).+(@.*)\z/, '\\1••••\\2').gsub(/\A(.{2}).+\z/, '\\1••••')
    end

    private

    def patient_belongs_to_practice
      errors.add(:patient, "must belong to this practice") if patient && patient.practice_id != practice_id
    end
  end
end
