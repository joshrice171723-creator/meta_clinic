module Clinic
  module Workforce
    class AvailabilityVersion < ApplicationRecord
      self.table_name = "clinic_workforce_availability_versions"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :employment, class_name: "Clinic::Workforce::Employment"
      belongs_to :created_by, class_name: "Clinic::Membership", foreign_key: :created_by_id, primary_key: :user_id
      belongs_to :reviewed_by, class_name: "Clinic::Membership", foreign_key: :reviewed_by_id, primary_key: :user_id, optional: true

      before_validation { self.public_id ||= SecureRandom.uuid }
      validates :public_id, presence: true, uniqueness: { scope: :practice_id }
      validates :idempotency_key, presence: true, uniqueness: { scope: :practice_id }
      validates :request_digest, format: { with: /\A[0-9a-f]{64}\z/ }
      validates :effective_from, :timezone, :submitted_at, presence: true
      validates :status, inclusion: { in: %w[submitted approved denied cancelled superseded] }
      validates :reason, presence: true, length: { maximum: 500 }
      validates :decision_reason, length: { maximum: 500 }, allow_blank: true
      validates :revision, numericality: { only_integer: true, greater_than: 0 }
      validate :rules_shape
      validate :valid_timezone

      def available_for?(starts_at, ends_at)
        return false unless ends_at > starts_at

        availability_boundaries(starts_at, ends_at).each_cons(2).all? do |segment_start, segment_end|
          available_for_segment?(segment_start, segment_end - Rational(1, 1_000_000))
        end
      end

      private

      def availability_boundaries(starts_at, ends_at)
        transitions = TZInfo::Timezone.get(timezone).transitions_up_to(ends_at, starts_at)
          .map { |transition| transition.at.to_time }
          .select { |transition| transition > starts_at && transition < ends_at }
        [ starts_at, *transitions, ends_at ]
      end

      def available_for_segment?(starts_at, ends_at)
        local_start = starts_at.in_time_zone(timezone)
        local_end = ends_at.in_time_zone(timezone)
        [ local_start.to_date, local_start.to_date.prev_day ].any? do |anchor_date|
          weekly_rules.select { |rule| rule["day_of_week"].to_i == anchor_date.wday }.any? do |rule|
            next false if rule["available"] == false

            range_start = clock_seconds(rule["start_time"])
            range_end = clock_seconds(rule["end_time"])
            range_end += 86_400 if range_end <= range_start
            shift_start = local_seconds(local_start) + ((local_start.to_date - anchor_date).to_i * 86_400)
            shift_end = local_seconds(local_end) + ((local_end.to_date - anchor_date).to_i * 86_400)
            range_start <= shift_start && range_end >= shift_end
          end
        end
      end

      def rules_shape
        time_pattern = /\A(?:[01]\d|2[0-3]):[0-5]\d\z/
        unless weekly_rules.is_a?(Array) && weekly_rules.all? do |rule|
          day = rule.is_a?(Hash) ? rule["day_of_week"] : nil
          valid_day = day.is_a?(Integer) ? (0..6).cover?(day) : day.is_a?(String) && day.match?(/\A[0-6]\z/)
          rule.is_a?(Hash) && valid_day &&
            (rule["available"] == false || (rule["start_time"].to_s.match?(time_pattern) && rule["end_time"].to_s.match?(time_pattern)))
        end
          errors.add(:weekly_rules, "must contain day and time ranges")
        end
      end

      def valid_timezone
        TZInfo::Timezone.get(timezone) if timezone.present?
      rescue TZInfo::InvalidTimezoneIdentifier
        errors.add(:timezone, "must be an IANA time zone")
      end

      def clock_seconds(value)
        hour, minute = value.split(":").map(&:to_i)
        hour * 3600 + minute * 60
      end

      def local_seconds(time)
        time.hour * 3600 + time.min * 60 + time.sec + time.subsec
      end
    end
  end
end
