module Clinic
  module Care
    class EncounterIntakeRevision < ApplicationRecord
      self.table_name = "clinic_encounter_intake_revisions"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter"
      belongs_to :encounter_intake, class_name: "Clinic::Care::EncounterIntake"
      belongs_to :author_membership, class_name: "Clinic::Membership"
      has_many :items, class_name: "Clinic::Care::EncounterIntakeItem", foreign_key: :intake_revision_id,
        dependent: :restrict_with_error

      validates :revision_no, numericality: { only_integer: true, greater_than: 0 }
      validates :completeness_state, inclusion: { in: %w[incomplete complete unknown] }
      validates :information_source, inclusion: { in: %w[patient caregiver clinician external_record other] }
      validates :recorded_at, presence: true
      validate :context_matches

      private

      def context_matches
        records = [ patient, encounter, encounter_intake, author_membership ].compact
        errors.add(:base, "Intake revision context must belong to one practice") if records.any? { |record| record.practice_id != practice_id }
        errors.add(:encounter, "must belong to this patient") if encounter && encounter.patient_id != patient_id
        if encounter_intake && (encounter_intake.patient_id != patient_id || encounter_intake.encounter_id != encounter_id)
          errors.add(:encounter_intake, "must belong to this encounter")
        end
      end
    end
  end
end
