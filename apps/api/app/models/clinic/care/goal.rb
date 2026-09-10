module Clinic
  module Care
    class Goal < ChartCoverageRecord
      self.table_name = "clinic_goals"
      include Clinic::Auditable

      belongs_to :care_plan, class_name: "Clinic::Care::CarePlan"
      encrypts :description, :outcome_text
      validates :status, inclusion: { in: %w[not_started in_progress achieved not_achieved cancelled] }
      validates :description, presence: true, length: { maximum: 2_000 }
      validates :outcome_text, length: { maximum: 2_000 }, allow_nil: true
      validate :care_plan_matches_context

      private

      def care_plan_matches_context
        return unless care_plan

        valid = care_plan.practice_id == practice_id && care_plan.patient_id == patient_id && care_plan.encounter_id == encounter_id
        errors.add(:care_plan, "must belong to this chart context") unless valid
      end
    end
  end
end
