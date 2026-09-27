module Clinic
  module Reports
    class DailyVisitsByState
      STATES = Clinic::Appointment::TRANSITIONS.keys.freeze

      def self.call(practice:, actor:, date:, site: nil, page: 1)
        raise ActiveRecord::RecordNotFound if site && site.practice_id != practice.id

        Clinic::Authorization.authorize!(actor: actor, practice: practice, action: "appointments.read", site: site)
        zone_name = site&.timezone_override.presence || practice.timezone
        zone = ActiveSupport::TimeZone[zone_name]
        raise ArgumentError, "The clinic timezone is unavailable." unless zone

        starts_at = zone.local(date.year, date.month, date.day)
        next_date = date.next_day
        ends_at = zone.local(next_date.year, next_date.month, next_date.day)
        scope = practice.appointments.where(starts_at: starts_at...ends_at)
        scope = scope.where(site_id: site.id) if site
        records, pagination = SourcePage.call(scope: scope, page: page)
        grouped = scope.group(:status, :site_id).count
        counts = STATES.index_with { 0 }
        unknown_state_count = 0
        unassigned_site_count = 0
        grouped.each do |(state, site_id), count|
          counts.key?(state) ? counts[state] += count : unknown_state_count += count
          unassigned_site_count += count if site_id.nil?
        end

        {
          definition: Catalog::DAILY_VISITS_BY_STATE,
          practice_id: practice.id,
          site_id: site&.id,
          date: date.iso8601,
          timezone: zone.tzinfo.name,
          interval_start: starts_at.iso8601(6),
          interval_end: ends_at.iso8601(6),
          as_of: Time.current.iso8601(6),
          freshness: "live_source_query_no_cache",
          records: records.order(:starts_at, :id).pluck(:id, :site_id, :status, :visit_modality, :starts_at).map do |id, site_id, status, visit_modality, starts_at|
            { id: id, site_id: site_id, status: status, visit_modality: visit_modality,
              local_start: starts_at.in_time_zone(zone).strftime("%H:%M") }
          end,
          pagination: pagination,
          counts: counts,
          total: counts.values.sum + unknown_state_count,
          unknown_state_count: unknown_state_count,
          unassigned_site_count: unassigned_site_count
        }
      end
    end
  end
end
