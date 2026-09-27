module Clinic
  module Reports
    class DailyStockMovements
      def self.call(practice:, actor:, date:, page: 1)
        Clinic::Authorization.authorize!(actor:, practice:, action: "inventory.read")
        zone = ActiveSupport::TimeZone[practice.timezone] || raise(ArgumentError, "The clinic timezone is unavailable.")
        starts_at = zone.local(date.year, date.month, date.day)
        ends_at = zone.local(date.next_day.year, date.next_day.month, date.next_day.day)
        entries = Clinic::Inventory::Entry.where(practice:, occurred_at: starts_at...ends_at)
        records, pagination = SourcePage.call(scope: entries, page:)
        counts = entries.group(:stock_type, :stock_unit, :kind).count
        quantities = entries.group(:stock_type, :stock_unit, :kind).sum(:quantity)
        {
          definition: Catalog::DAILY_STOCK_MOVEMENTS, practice_id: practice.id, date: date.iso8601,
          timezone: zone.tzinfo.name, interval_start: starts_at.iso8601(6), interval_end: ends_at.iso8601(6),
          as_of: Time.current.iso8601(6), freshness: "live_source_query_no_cache",
          records: records.order(occurred_at: :desc, id: :desc)
            .pluck(:id, :stock_type, :stock_unit, :kind, :quantity, :occurred_at, :item_id, :batch_id)
            .map { |id, stock_type, stock_unit, kind, quantity, occurred_at, item_id, batch_id|
              { id:, stock_type:, stock_unit:, kind:, signed_quantity: quantity.to_d.to_s("F"),
                occurred_at: occurred_at.iso8601(6), item_id:, batch_id: }
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
