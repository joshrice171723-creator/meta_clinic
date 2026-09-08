module Clinic
  class EncounterParticipant < ApplicationRecord
    self.table_name = "clinic_encounter_participants"
    include TenantScoped
    include Auditable

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :encounter, class_name: "Clinic::Encounter"
    belongs_to :membership, class_name: "Clinic::Membership"

    validates :participation_role, :effective_from, presence: true
    validate :valid_effective_window
    validate :same_patient_and_practice

    scope :current, ->(at = Current.business_time) { where("effective_from <= ? AND (effective_until IS NULL OR effective_until > ?)", at, at) }
    scope :queue_providers, -> { where(participation_role: "queue_provider") }

    private

    def valid_effective_window
      errors.add(:effective_until, "must be after effective_from") if effective_until && effective_from && effective_until <= effective_from
    end

    def same_patient_and_practice
      { patient: patient, encounter: encounter, membership: membership }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
      end
      errors.add(:encounter, "must belong to the same patient") if encounter && encounter.patient_id != patient_id
    end
  end
end
