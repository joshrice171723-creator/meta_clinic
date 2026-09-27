module Clinic
  module Reports
    class CurrentStock
      def self.call(practice:, actor:, page: 1, office_page: 1, status: "all")
        Clinic::Authorization.authorize!(actor:, practice:, action: "inventory.read")
        day = practice.inventory_date
        positions = Clinic::Inventory::ProductDetailsQuery.positions(practice:, page:, status:)
        office = practice.items
        office_records, office_pagination = SourcePage.call(scope: office, page: office_page)
        product_stock = Clinic::Inventory::PharmacyProduct.where(practice_id: practice.id).with_stock(day)
        low_stock = Clinic::Inventory::PharmacyProduct.from("(#{product_stock.to_sql}) clinic_pharmacy_products")
          .where("active AND available_stock <= reorder_point")
        {
          as_of: Time.current.iso8601(6), inventory_date: day.iso8601, timezone: practice.timezone,
          source: "clinic_pharmacy_batches, clinic_inventory_holds, clinic_pharmacy_products and clinic_items",
          status:, low_product_count: low_stock.count,
          pharmacy_units: positions.unit_totals.map { |unit, physical, available|
            { unit:, physical: physical.to_d.to_s("F"), available: available.to_d.to_s("F") }
          },
          pagination: { page: positions.page, per_page: 25, total: positions.filtered_count, total_pages: positions.page_count },
          pharmacy_records: positions.batches.map { |batch|
            { id: batch.id, product_id: batch.product_id, name: batch.product.name,
              lot: batch.lot_number, location: batch.location_record.name,
              unit: batch.product.stock_unit, physical: batch.on_hand.to_d.to_s("F"),
              available: batch.available?, status: batch.display_status,
              expires_on: batch.expires_on.iso8601, expiring: batch.expiring? }
          },
          office_pagination:, office_quantity: office.sum(:quantity).to_s,
          low_office_count: office.where("quantity <= reorder_level").count,
          office_records: office_records.order(:name, :id).map { |item|
            { id: item.id, name: item.name, sku: item.sku, quantity: item.quantity.to_s,
              reorder_level: item.reorder_level.to_s, low_stock: item.quantity <= item.reorder_level }
          }
        }
      end
    end
  end
end
