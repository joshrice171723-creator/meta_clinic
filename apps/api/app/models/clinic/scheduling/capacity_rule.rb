module Clinic
  module Scheduling
    class CapacityRule < ApplicationRecord
      self.table_name = "clinic_capacity_rules"
      include Clinic::TenantScoped
      include Clinic::Auditable
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :clinician, class_name: "Clinic::ClinicianProfile"
      belongs_to :operational_policy_version, class_name: "Clinic::Scheduling::OperationalPolicyVersion", optional: true
      encrypts :reason
      validates :kind, inclusion: { in: %w[weekly block] }
      validates :reason, length: { maximum: 500 }
      validate :context_and_interval
      validate :category_reference_matches

      private

      def category_reference_matches
        if persisted? && (will_save_change_to_operational_policy_version_id? || will_save_change_to_reason_category_key?)
          errors.add(:reason_category_key, "cannot rewrite recorded block category provenance.")
        end
        return if operational_policy_version_id.nil? && reason_category_key.nil?
        policy = operational_policy_version
        unless kind == "block" && policy && reason_category_key.present? &&
          policy.practice_id == practice_id && policy.site_id == site_id &&
          policy.block_categories.any? { |entry| entry.fetch("key") == reason_category_key }
          errors.add(:reason_category_key, "must reference a category in this location's recorded policy revision.")
        end
      end

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
