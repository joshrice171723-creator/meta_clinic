module Development
  class DemoRun < ApplicationRecord
    self.table_name = "development_demo_runs"

    belongs_to :practice, class_name: "Clinic::Practice"
    belongs_to :visitor, class_name: "Development::DemoVisitor", optional: true
    belongs_to :operator_user, class_name: "User"
    belongs_to :patient_user, class_name: "User", optional: true
    belongs_to :membership_prospect, class_name: "Clinic::MembershipProspect", optional: true

    validates :template_key, presence: true, inclusion: { in: %w[primary_care weight_management] }
    validates :lesson_key, inclusion: { in: ->(_) { DemoLessonCatalog.lesson_keys } }, allow_nil: true
    validates :elapsed_seconds, numericality: { only_integer: true, greater_than_or_equal_to: 0 }

    scope :active, -> { where(active: true) }

    def patient
      membership_prospect&.patient
    end

    def paid_patient?
      membership_prospect&.paid_at.present? && patient.present?
    end

    def elapsed_seconds_at(time)
      return elapsed_seconds unless active?

      elapsed_seconds + [ (time - created_at).to_i, 0 ].max
    end

    def self.local_practice?(practice)
      active.exists?(practice_id: practice.respond_to?(:id) ? practice.id : practice)
    end

    def self.synthetic_practice?(practice)
      return false unless GuidedDemoAccess.enabled?
      return true if local_practice?(practice)
      return false unless practice.organization && DemoLesson.exists?(
        lesson_key: DemoLessonCatalog::SANDBOX_COMPANION_KEY, practice_id: practice.id)

      primary = DemoLesson.find_by(lesson_key: DemoLessonCatalog::SANDBOX_KEY,
        practice_id: practice.organization.practice_ids)
      primary && active.exists?(practice_id: primary.practice_id, lesson_key: DemoLessonCatalog::SANDBOX_KEY)
    end
  end
end
