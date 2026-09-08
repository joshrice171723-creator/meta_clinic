module Clinic
  module Inventory
    class ProductDetailsQuery
      Result = Data.define(:product, :batch_page, :batch_count, :batches, :counts, :receipt_lines, :histories)
      POSITION_PAGE_SIZE = 25
      Positions = Data.define(:batches, :total_count, :filtered_count, :query, :status, :product, :page, :page_count, :unit_totals)

      def self.positions(practice:, query: nil, status: nil, product_id: nil, page: nil)
        query = query.to_s.strip
        status = status.presence || "all"
        raise ArgumentError, "Search must be 100 characters or fewer." if query.length > 100
        raise ArgumentError, "Choose a supported stock status." unless %w[all available held expired].include?(status)
        page = page.presence || "1"
        raise ArgumentError, "Choose a valid stock page." unless /\A[1-9][0-9]{0,5}\z/.match?(page.to_s)
        product = PharmacyProduct.where(practice_id: practice.id).find(product_id) if product_id.present?
        scope = PharmacyBatch.where(practice_id: practice.id)
        filtered = scope.joins(:product, :location_record)
        filtered = filtered.where(product_id: product.id) if product
        if query.present?
          filtered = filtered.where("concat_ws(' ',clinic_pharmacy_products.name,clinic_pharmacy_products.ndc,clinic_pharmacy_products.device_identifier,clinic_pharmacy_batches.lot_number,clinic_inventory_locations.name) ILIKE ?", "%#{PharmacyBatch.sanitize_sql_like(query)}%")
        end
        day = practice.inventory_date
        available_sql = "#{PharmacyBatch::NO_HOLD_SQL} AND #{PharmacyBatch::STOCK_DESTINATION_SQL} AND clinic_pharmacy_batches.expires_on >= #{PharmacyBatch.connection.quote(day)} AND clinic_pharmacy_products.active"
        filtered = filtered.where(available_sql).where("clinic_pharmacy_batches.on_hand > 0") if status == "available"
        filtered = filtered.where("NOT (#{PharmacyBatch::NO_HOLD_SQL})") if status == "held"
        filtered = filtered.where("clinic_pharmacy_batches.expires_on < ?", day) if status == "expired"
        count = filtered.count
        page_count = [ (count + POSITION_PAGE_SIZE - 1) / POSITION_PAGE_SIZE, 1 ].max
        page = [ page.to_i, page_count ].min
        totals = filtered.group("clinic_pharmacy_products.stock_unit").order("clinic_pharmacy_products.stock_unit").pluck("clinic_pharmacy_products.stock_unit",
          Arel.sql("SUM(clinic_pharmacy_batches.on_hand)"), Arel.sql("SUM(CASE WHEN #{available_sql} THEN clinic_pharmacy_batches.on_hand ELSE 0 END)"))
        Positions.new(batches: filtered.includes(:product, :lot, :location_record).order(:expires_on, :id).limit(POSITION_PAGE_SIZE).offset((page - 1) * POSITION_PAGE_SIZE).to_a,
          total_count: scope.count, filtered_count: count, query: query, status: status, product: product, page: page, page_count: page_count, unit_totals: totals)
      end

      def self.call(practice:, product_id:, page: nil)
        product = PharmacyProduct.where(practice_id: practice.id).find(product_id)
        page = page.to_i.clamp(1, 100_000)
        batches = product.batches.includes(:product, :practice).order(:expires_on, :id).limit(10).offset((page - 1) * 10).to_a
        Result.new(product: product, batch_page: page, batch_count: product.batches.count, batches: batches,
          counts: batches.to_h { |batch| [ batch.id, batch.counts.includes(:approval).order(id: :desc).limit(10).to_a ] },
          receipt_lines: batches.to_h { |batch| [ batch.id, ReceiptLine.where(practice_id: practice.id, batch_id: batch.id).includes(receipt: :supplier).order(id: :desc).limit(20).to_a ] },
          histories: batches.to_h { |batch| [ batch.id, (batch.movements.order(id: :desc).limit(30).to_a + batch.events.order(id: :desc).limit(30).to_a).sort_by(&:created_at).reverse ] })
      end
    end
  end
end
