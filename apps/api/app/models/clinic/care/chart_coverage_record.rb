module Clinic
  module Care
    class ChartCoverageRecord < ApplicationRecord
      self.abstract_class = true

      include Clinic::TenantScoped

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter", optional: true
      belongs_to :site, class_name: "Clinic::Site", optional: true
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership"
      belongs_to :updated_by_membership, class_name: "Clinic::Membership"

      attr_readonly :practice_id, :patient_id, :encounter_id, :site_id, :recorded_by_membership_id
      validates :lock_version, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
      validate :chart_context_is_consistent

      private

      def chart_context_is_consistent
        [ patient, encounter, site, recorded_by_membership, updated_by_membership ].compact.each do |record|
          errors.add(:base, "Chart records must belong to one practice") if record.practice_id != practice_id
        end
        errors.add(:encounter, "must belong to this patient") if encounter && encounter.patient_id != patient_id
        errors.add(:site, "must match the encounter site") if encounter && site && encounter.site_id != site_id
      end
    end
  end
end
