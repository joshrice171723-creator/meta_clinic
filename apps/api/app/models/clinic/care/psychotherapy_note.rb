module Clinic
  module Care
    class PsychotherapyNote < ApplicationRecord
      self.table_name = "clinic_psychotherapy_notes"
      include TenantScoped
      include AppendOnly

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter"
      belongs_to :originator_membership, class_name: "Clinic::Membership"
      belongs_to :previous_revision, class_name: "Clinic::Care::PsychotherapyNote", optional: true

      encrypts :body, :revision_reason

      validates :body, presence: true, length: { maximum: 50_000 }
      validates :revision_reason, length: { maximum: 2_000 }
      validates :version_number, numericality: { only_integer: true, greater_than: 0 }
      validate :linked_records_share_context

      private

      def linked_records_share_context
        errors.add(:patient, "must belong to this practice") if patient && patient.practice_id != practice_id
        errors.add(:encounter, "must belong to this patient and practice") if encounter &&
          (encounter.practice_id != practice_id || encounter.patient_id != patient_id)
        errors.add(:originator_membership, "must belong to this practice") if originator_membership &&
          originator_membership.practice_id != practice_id
        errors.add(:previous_revision, "must have the same originator and encounter") if previous_revision &&
          (previous_revision.practice_id != practice_id || previous_revision.encounter_id != encounter_id ||
           previous_revision.originator_membership_id != originator_membership_id ||
           previous_revision.version_number + 1 != version_number)
      end
    end
  end
end
