module Platform
  class WebsiteTraffic
    def self.call(now: Time.current)
      today = now.utc.to_date
      visits = PageVisit.where(created_at: (today - 29).beginning_of_day..now)
      daily = visits.group(Arel.sql("DATE(created_at AT TIME ZONE 'UTC')")).count
      page_views = visits.group(:path).count
      page_visitors = visits.group(:path).distinct.count(:visitor_id)
      page_last_visits = visits.group(:path).maximum(:created_at)
      {
        period: "Last 30 days (UTC)",
        views: visits.count,
        visitors: visits.distinct.count(:visitor_id),
        pages: PageVisit::PATHS.map do |path|
          {
            path:,
            views: page_views.fetch(path, 0),
            visitors: page_visitors.fetch(path, 0),
            last_visit_at: page_last_visits[path]&.iso8601
          }
        end,
        daily: (0..29).map { |offset| { date: (today - offset).iso8601, views: daily.fetch(today - offset, 0) } },
        referrers: visits.group(:referrer_host).order(Arel.sql("COUNT(*) DESC"), :referrer_host).limit(10).count.map do |host, count|
          { host: host.presence || "Direct / unknown", views: count }
        end
      }
    end
  end
end
