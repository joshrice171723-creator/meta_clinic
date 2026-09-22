module Platform
  class WebsiteTraffic
    def self.call(now: Time.current)
      today = now.utc.to_date
      visits = PageVisit.where(created_at: (today - 29).beginning_of_day..now)
      daily = visits.group(Arel.sql("DATE(created_at AT TIME ZONE 'UTC')")).count
      {
        period: "Last 30 days (UTC)",
        views: visits.count,
        visitors: visits.distinct.count(:visitor_id),
        pages: PageVisit::PATHS.map do |path|
          page = visits.where(path:)
          { path:, views: page.count, visitors: page.distinct.count(:visitor_id), last_visit_at: page.maximum(:created_at)&.iso8601 }
        end,
        daily: (0..29).map { |offset| { date: (today - offset).iso8601, views: daily.fetch(today - offset, 0) } },
        referrers: visits.group(:referrer_host).order(Arel.sql("COUNT(*) DESC"), :referrer_host).limit(10).count.map do |host, count|
          { host: host.presence || "Direct / unknown", views: count }
        end
      }
    end
  end
end
