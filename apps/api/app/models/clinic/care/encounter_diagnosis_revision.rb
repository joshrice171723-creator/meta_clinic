module Clinic
  module Care
    class EncounterDiagnosisRevision < ApplicationRecord
      self.table_name = "clinic_encounter_diagnosis_revisions"
      include Clinic::ClinicalRevision

      STATUSES = %w[draft provisional confirmed refuted resolved entered_in_error].freeze
      CLASSIFICATIONS = %w[primary secondary differential historical].freeze

      belongs_to :prior_revision, class_name: name, optional: true

      encrypts :code_system, :diagnosis_code, :diagnosis_display, :clinical_note
      validates :status, inclusion: { in: STATUSES }
      validates :classification, inclusion: { in: CLASSIFICATIONS }
      validates :diagnosis_display, presence: true, length: { maximum: 500 }
      validates :code_system, :diagnosis_code, length: { maximum: 240 }, allow_nil: true
      validates :clinical_note, length: { maximum: 2_000 }, allow_nil: true
    end
  end
end
