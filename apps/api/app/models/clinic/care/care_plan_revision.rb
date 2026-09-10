module Clinic
  module Care
    class CarePlanRevision < ApplicationRecord
      self.table_name = "clinic_care_plan_revisions"
      include Clinic::ClinicalRevision

      STATUSES = %w[draft active on_hold completed cancelled entered_in_error].freeze

      belongs_to :prior_revision, class_name: name, optional: true
      has_many :goal_revisions, class_name: "Clinic::Care::CareGoalRevision",
        foreign_key: :care_plan_revision_id, dependent: :restrict_with_error

      encrypts :title, :description
      validates :status, inclusion: { in: STATUSES }
      validates :title, presence: true, length: { maximum: 500 }
      validates :description, length: { maximum: 4_000 }, allow_nil: true
      validates :ends_on, comparison: { greater_than_or_equal_to: :starts_on }, allow_nil: true, if: :starts_on?
    end
  end
end
