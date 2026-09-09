module Clinic
  class VisitType < ApplicationRecord
    self.table_name = "clinic_visit_types"
    include TenantScoped
    include Auditable

    has_many :appointments, class_name: "Clinic::Appointment", dependent: :restrict_with_error
    has_many :telehealth_rules, class_name: "Clinic::Telehealth::VisitTypeRule", dependent: :restrict_with_error
    scope :active, -> { where(retired_at: nil) }

    validates :code, presence: true, length: { maximum: 80 }, uniqueness: { scope: :practice_id }
  end
end
