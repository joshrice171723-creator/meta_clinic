module Clinic
  module Care
    class CarePlan < ChartCoverageRecord
      self.table_name = "clinic_care_plans"
      include Clinic::Auditable

      has_many :goals, class_name: "Clinic::Care::Goal", dependent: :restrict_with_error
      encrypts :title, :description
      validates :status, inclusion: { in: %w[draft active completed cancelled] }
      validates :title, presence: true, length: { maximum: 500 }
      validates :description, length: { maximum: 4_000 }, allow_nil: true
    end
  end
end
