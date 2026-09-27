module Clinic
  module Scheduling
    class ClosureRecovery
      # Receives the caller's already-authorized scope; never widens that scope.
      def self.call(scope:, practice:)
        affected = scope.where(site_id: practice.sites.where(status: %w[temporarily_closed retired]).select(:id))
        # ponytail: one range per future closure; use a calendar join if closure volume makes SQL size material.
        SiteHourException.where(practice: practice, closed: true)
          .where(date: (Current.business_time.utc.to_date - 1)..).includes(:site).find_each do |closure|
          zone = ActiveSupport::TimeZone[closure.site.timezone_override.presence || practice.timezone] ||
            raise(ArgumentError, "The closure site's timezone is unavailable.")
          day = closure.date
          next_day = day.next_day
          interval = zone.local(day.year, day.month, day.day)...zone.local(next_day.year, next_day.month, next_day.day)
          affected = affected.or(scope.where(site_id: closure.site_id, starts_at: interval))
        end
        affected.where(status: %w[scheduled confirmed]).where("starts_at > ?", Current.business_time)
          .where.missing(:encounter)
      end

      def self.reason(appointment, practice:)
        return "Location is #{appointment.site.status.tr('_', ' ')}" if %w[temporarily_closed retired].include?(appointment.site.status)

        zone = ActiveSupport::TimeZone[appointment.site.timezone_override.presence || practice.timezone]
        "Location closed on #{appointment.starts_at.in_time_zone(zone).to_date.iso8601} (#{zone.tzinfo.name})"
      end
    end
  end
end
