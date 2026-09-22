module Clinic
  module Care
    class CareGoalRevision < ApplicationRecord
      self.table_name = "clinic_care_goal_revisions"
      include Clinic::ClinicalRevision

      STATUSES = %w[proposed active achieved not_achieved cancelled entered_in_error].freeze
      OUTCOME_SOURCES = %w[patient_reported clinician_observed proxy_reported imported unknown].freeze

      belongs_to :prior_revision, class_name: name, optional: true
      belongs_to :care_plan_revision, class_name: "Clinic::Care::CarePlanRevision"

      encrypts :description, :outcome_text
      validates :status, inclusion: { in: STATUSES }
      validates :description, presence: true, length: { maximum: 2_000 }
      validates :outcome_text, length: { maximum: 2_000 }, allow_nil: true
      validates :outcome_source, inclusion: { in: OUTCOME_SOURCES }, allow_nil: true
      validate :plan_context_matches
      validate :outcome_provenance_complete

      private

      def plan_context_matches
        return unless care_plan_revision
        expected = [ practice_id, patient_id, encounter_id ]
        actual = [ care_plan_revision.practice_id, care_plan_revision.patient_id,
          care_plan_revision.encounter_id ]
        errors.add(:care_plan_revision, "must belong to this encounter") unless actual == expected
      end

      def outcome_provenance_complete
        return if outcome_source.blank? && outcome_recorded_at.blank?
        return if outcome_source.present? && outcome_recorded_at.present?

        errors.add(:base, "Outcome source and recorded time must be entered together.")
      end
    end
  end
end
