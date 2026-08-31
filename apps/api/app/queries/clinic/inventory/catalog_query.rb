module Clinic
  module Inventory
    class CatalogQuery
      Result = Data.define(:product_count, :active_count, :low_count, :low_stock,
        :unit_totals, :attention, :movements, :profile, :query, :filter, :page, :filtered_count, :filtered)

      def self.call(practice:, query: nil, filter: nil, page: nil)
        day = practice.inventory_date
        stock = PharmacyProduct.where(practice_id: practice.id).with_stock(day)
        summary = PharmacyProduct.from("(#{stock.to_sql}) clinic_pharmacy_products")
        low = summary.where("active AND available_stock <= reorder_point")
        query = query.to_s.strip.first(100)
        filter = %w[low_stock expiring held].include?(filter) ? filter : "all"
        page = page.to_i.clamp(1, 100_000)
        filtered = summary.where("concat_ws(' ',name,generic_name,sku,ndc,labeler) ILIKE ?", "%#{PharmacyProduct.sanitize_sql_like(query)}%")
        filtered = case filter
        when "low_stock" then filtered.where("active AND available_stock <= reorder_point")
        when "expiring" then filtered.where("next_expiry <= ?", day + 30)
        when "held" then filtered.where("physical_stock > available_stock")
        else filtered
        end

        Result.new(product_count: summary.count, active_count: summary.where(active: true).count,
          low_count: low.count, low_stock: low.order(:name, :id).limit(20),
          unit_totals: summary.group(:stock_unit).pluck(:stock_unit, Arel.sql("SUM(available_stock)"), Arel.sql("SUM(physical_stock-available_stock)")),
          attention: PharmacyBatch.where(practice_id: practice.id).where("on_hand > 0")
            .where("expires_on <= ? OR NOT (#{PharmacyBatch::NO_HOLD_SQL}) OR NOT clinic_pharmacy_products.active", day + 30)
            .joins(:product).includes(:product, :practice).order(:expires_on, :id).limit(20),
          movements: PharmacyMovement.where(practice_id: practice.id).includes(batch: :product).order(id: :desc).limit(30),
          profile: practice.inventory_profiles.order(version: :desc).first,
          query: query, filter: filter, page: page, filtered_count: filtered.count,
          filtered: filtered.order(:name, :id).limit(25).offset((page - 1) * 25))
      end
    end
  end
end
