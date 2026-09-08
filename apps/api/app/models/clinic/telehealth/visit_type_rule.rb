module Clinic
  module Telehealth
    class VisitTypeRule < ApplicationRecord
      self.table_name = "clinic_telehealth_visit_type_rules"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :visit_type, class_name: "Clinic::VisitType"
      belongs_to :site, class_name: "Clinic::Site", optional: true
      belongs_to :updated_by_membership, class_name: "Clinic::Membership"

      validates :allowed_region_codes, length: { maximum: 250 }
      validates :min_patient_age_years, :max_patient_age_years,
        numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 130 }, allow_nil: true
      validate :valid_age_range

      private

      def valid_age_range
        return unless min_patient_age_years && max_patient_age_years
        errors.add(:max_patient_age_years, "must not be less than the minimum age") if max_patient_age_years < min_patient_age_years
      end
    end
  end
end
