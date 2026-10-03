module Clinic
  module Reports
    class DailyStockMovements
      def self.call(practice:, actor:, date:, page: 1, export_limit: nil, export_deadline: nil)
        Clinic::Authorization.authorize!(actor:, practice:, action: "inventory.read")
        zone = ActiveSupport::TimeZone[practice.timezone] || raise(ArgumentError, "The clinic timezone is unavailable.")
        starts_at = zone.local(date.year, date.month, date.day)
        ends_at = zone.local(date.next_day.year, date.next_day.month, date.next_day.day)
        entries = Clinic::Inventory::Entry.where(practice:, occurred_at: starts_at...ends_at)
        records, pagination = SourcePage.call(scope: entries, page:, export_limit:, export_deadline:)
        counts = entries.group(:stock_type, :stock_unit, :kind).count
        quantities = entries.group(:stock_type, :stock_unit, :kind).sum(:quantity)
        {
          definition: Catalog::DAILY_STOCK_MOVEMENTS, practice_id: practice.id, date: date.iso8601,
          timezone: zone.tzinfo.name, interval_start: starts_at.iso8601(6), interval_end: ends_at.iso8601(6),
          as_of: Time.current.iso8601(6), freshness: "live_source_query_no_cache",
          records: records.order(occurred_at: :desc, id: :desc)
            .select(:id, :stock_type, :stock_unit, :kind, :quantity, :occurred_at, :item_id, :batch_id)
            .includes(batch: { location_record: :site }).map { |entry|
              SourcePage.check_export_deadline!(deadline: export_deadline)
              location = entry.batch&.location_record
              site = location&.site
              { id: entry.id, stock_type: entry.stock_type, stock_unit: entry.stock_unit, kind: entry.kind,
                signed_quantity: entry.quantity.to_d.to_s("F"), occurred_at: entry.occurred_at.iso8601(6),
                item_id: entry.item_id, batch_id: entry.batch_id, location_id: location&.id, location_name: location&.name,
                source_site_id: site&.id, source_site_name: site ? (site.name.presence || site.code) : "Shared / unassigned" }
            },
          records_capped: pagination[:total_pages] > 1,
          pagination:,
          movements: counts.keys.sort.map do |stock_type, stock_unit, kind|
            { stock_type:, stock_unit:, kind:, count: counts.fetch([ stock_type, stock_unit, kind ]),
              signed_quantity: quantities.fetch([ stock_type, stock_unit, kind ]).to_d.to_s("F") }
          end
        }
      end
    end
  end
end
