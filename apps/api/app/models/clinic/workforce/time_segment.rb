module Clinic
  module Workforce
    class TimeSegment < ApplicationRecord
      self.table_name = "clinic_workforce_time_segments"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :timecard_version, class_name: "Clinic::Workforce::TimecardVersion"
      belongs_to :site, class_name: "Clinic::Site"

      validates :segment_kind, inclusion: { in: %w[work break manual] }
      validates :started_at_utc, :ended_at_utc, :local_date, presence: true
      validates :raw_minutes, :rounded_minutes, :paid_minutes,
        numericality: { only_integer: true, greater_than_or_equal_to: 0 }
      validate :ends_after_start

      private

      def ends_after_start
        errors.add(:ended_at_utc, "must be after the start") if started_at_utc && ended_at_utc && ended_at_utc <= started_at_utc
      end
    end
  end
end
