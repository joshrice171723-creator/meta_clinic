module Clinic
  module Inventory
    module CatalogResponse
      def self.call(catalog)
        { product_count: catalog.product_count, active_count: catalog.active_count, low_count: catalog.low_count,
          query: catalog.query, filter: catalog.filter, page: catalog.page, filtered_count: catalog.filtered_count,
          unit_totals: catalog.unit_totals.map { |unit, available, held| { unit: unit, available: available.to_s("F"), unavailable: held.to_s("F") } },
          products: catalog.filtered.map { |record| ProductResponse.product(record) },
          low_stock: catalog.low_stock.map { |record| ProductResponse.product(record) },
          attention: catalog.attention.map { |record| ProductResponse.batch(record) },
          movements: catalog.movements.map { |record| ProductResponse.event(record).merge(product_id: record.batch.product_id,
            product_name: record.batch.product.name, lot_number: record.batch.lot_number, location: record.batch.location, stock_unit: record.stock_unit) },
          profile: catalog.profile&.as_json(only: %i[version status]) }
      end
    end
  end
end
