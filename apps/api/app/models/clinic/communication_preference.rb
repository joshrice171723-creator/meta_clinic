module Clinic
  class CommunicationPreference < ApplicationRecord
    self.table_name = "clinic_communication_preferences"
    include TenantScoped
    include AppendOnly

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    enum :setting, { allowed: "allowed", blocked: "blocked", not_set: "not_set" }, validate: true
    scope :current, -> { order(version: :desc).limit(1) }

    validates :category, inclusion: { in: %w[operational marketing] }
    validates :channel, inclusion: { in: %w[portal sms email] }
    validates :timezone, inclusion: { in: ActiveSupport::TimeZone::MAPPING.values + [ "UTC" ] }
    validates :version, numericality: { only_integer: true, greater_than: 0 }
    validate :patient_belongs_to_practice

    private

    def patient_belongs_to_practice
      errors.add(:patient, "must belong to this practice") if patient && patient.practice_id != practice_id
    end
  end
end
