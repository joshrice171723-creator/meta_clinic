module Clinic
  module Workforce
    class SettingsVersion < ApplicationRecord
      self.table_name = "clinic_workforce_settings_versions"
      include Clinic::TenantScoped
      include Clinic::Auditable

      PRACTICE_ONLY_KEYS = %w[timezone workweek_start_day workweek_start_time].freeze
      BOOLEAN_KEYS = %w[
        kiosk_enabled scanner_enabled camera_enabled manual_badge_entry_enabled pin_required
        break_tracking_enabled schedule_enabled employee_self_service_enabled
        availability_editing_enabled time_off_enabled shift_swaps_enabled
        availability_approval_required time_off_approval_required shift_swap_approval_required
        payroll_export_enabled
      ].freeze
      NULLABLE_INTEGER_KEYS = %w[
        break_duration_minutes break_reminder_minutes rounding_increment_minutes
        daily_overtime_threshold_minutes weekly_overtime_threshold_minutes
      ].freeze
      REQUIRED_KEYS = (PRACTICE_ONLY_KEYS + BOOLEAN_KEYS + NULLABLE_INTEGER_KEYS + %w[
        break_mode break_paid rounding_mode overtime_precedence approval_mode
        pay_cadence payroll_provider provider_mapping
      ]).freeze
      SITE_KEYS = (REQUIRED_KEYS - PRACTICE_ONLY_KEYS).freeze
      ENUMS = {
        "break_mode" => %w[unconfigured manual],
        "rounding_mode" => %w[unconfigured none nearest up down],
        "overtime_precedence" => %w[unconfigured daily_then_weekly weekly_then_daily],
        "approval_mode" => %w[unconfigured manager_required employee_submit_manager_approve],
        "pay_cadence" => %w[unconfigured weekly biweekly semimonthly monthly],
        "payroll_provider" => %w[unconfigured custom_file]
      }.freeze

      enum :scope_kind, { practice: "practice", site: "site" }, validate: true

      belongs_to :site, class_name: "Clinic::Site", optional: true
      belongs_to :created_by_membership, class_name: "Clinic::Membership"

      validates :revision, numericality: { only_integer: true, greater_than: 0 }
      validates :effective_from, presence: true
      validate :scope_matches_site
      validate :related_records_belong_to_practice
      validate :values_follow_contract
      before_update :prevent_mutation
      before_destroy :prevent_mutation

      scope :effective_at, ->(at) { where("effective_from <= ?", at) }

      private

      def scope_matches_site
        errors.add(:site, "must be blank for practice settings") if practice? && site_id.present?
        errors.add(:site, "is required for site settings") if site? && site_id.blank?
      end

      def related_records_belong_to_practice
        { site: site, created_by_membership: created_by_membership }.each do |attribute, record|
          errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
        end
      end

      def values_follow_contract
        unless values.is_a?(Hash)
          errors.add(:values, "must be an object")
          return
        end

        keys = values.keys.map(&:to_s)
        allowed = practice? ? REQUIRED_KEYS : SITE_KEYS
        errors.add(:values, "contains unsupported settings") if (keys - allowed).any?
        errors.add(:values, "must include every practice setting") if practice? && (REQUIRED_KEYS - keys).any?
        errors.add(:values, "cannot override practice workweek or timezone") if site? && (keys & PRACTICE_ONLY_KEYS).any?

        BOOLEAN_KEYS.each { |key| validate_boolean(key) }
        validate_boolean("break_paid", nullable: true)
        NULLABLE_INTEGER_KEYS.each { |key| validate_nullable_integer(key) }
        ENUMS.each { |key, allowed_values| validate_enum(key, allowed_values) }
        validate_practice_values if practice?
        provider_mapping = setting("provider_mapping")
        if value_present?("provider_mapping") && !(provider_mapping.is_a?(Hash) || (site? && provider_mapping.nil?))
          errors.add(:provider_mapping, "must be an object")
        end
      end

      def validate_practice_values
        timezone = setting("timezone")
        valid_zones = ActiveSupport::TimeZone::MAPPING.values + [ "UTC" ]
        errors.add(:timezone, "must be an IANA timezone") unless valid_zones.include?(timezone)
        day = setting("workweek_start_day")
        errors.add(:workweek_start_day, "must be from 0 through 6") unless day.is_a?(Integer) && day.between?(0, 6)
        errors.add(:workweek_start_time, "must use HH:MM") unless setting("workweek_start_time").to_s.match?(/\A(?:[01]\d|2[0-3]):[0-5]\d\z/)
      end

      def validate_boolean(key, nullable: false)
        return unless value_present?(key)
        value = setting(key)
        return if (nullable || site?) && value.nil?

        errors.add(key, "must be true or false") unless value == true || value == false
      end

      def validate_nullable_integer(key)
        return unless value_present?(key)
        value = setting(key)
        return if value.nil?

        errors.add(key, "must be a positive whole number or unconfigured") unless value.is_a?(Integer) && value.positive?
      end

      def validate_enum(key, allowed_values)
        return unless value_present?(key)
        value = setting(key)
        return if site? && value.nil?

        errors.add(key, "is not supported") unless allowed_values.include?(value)
      end

      def value_present?(key)
        values.key?(key) || values.key?(key.to_sym)
      end

      def setting(key)
        values.key?(key) ? values[key] : values[key.to_sym]
      end

      def prevent_mutation
        errors.add(:base, "Workforce settings versions are immutable")
        throw :abort
      end
    end
  end
end
