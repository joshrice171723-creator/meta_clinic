module Clinic
  class EncounterNote < ApplicationRecord
    self.table_name = "clinic_encounter_notes"
    include TenantScoped
    include Auditable

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :encounter, class_name: "Clinic::Encounter"
    has_many :revisions, class_name: "Clinic::EncounterNoteRevision", foreign_key: :note_id, dependent: :restrict_with_error
    has_many :signatures, class_name: "Clinic::EncounterNoteSignature", foreign_key: :note_id, dependent: :restrict_with_error

    validates :patient_id, :encounter_id, :note_kind, presence: true
    validates :note_kind, format: { with: /\A[a-z][a-z0-9_]*\z/ }
    validates :note_kind, uniqueness: { scope: %i[practice_id encounter_id] }, if: -> { note_kind == "soap" }
    validate :encounter_belongs_to_patient

    private

    def encounter_belongs_to_patient
      errors.add(:encounter, "must belong to this patient") if encounter && encounter.patient_id != patient_id
    end
  end
end
