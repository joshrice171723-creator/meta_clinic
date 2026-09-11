module Clinic
  module Scheduling
    class CapacityRule < ApplicationRecord
      self.table_name = "clinic_capacity_rules"
      include Clinic::TenantScoped
      include Clinic::Auditable
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :clinician, class_name: "Clinic::ClinicianProfile"
      encrypts :reason
      validates :kind, inclusion: { in: %w[weekly block] }
      validates :reason, length: { maximum: 500 }
      validate :context_and_interval

      private

      def context_and_interval
        errors.add(:base, "Capacity must belong to one practice.") if [site, clinician].compact.any? { |item| item.practice_id != practice_id }
        if kind == "weekly"
          valid = weekday&.between?(0, 6) && start_minute&.between?(0, 1439) &&
            end_minute&.between?(1, 1440) && end_minute > start_minute
        else
          valid = starts_at && ends_at && ends_at > starts_at && reason.present?
        end
        errors.add(:base, "Choose a valid capacity interval and a reason for blocked time.") unless valid
      end
    end
  end
end
