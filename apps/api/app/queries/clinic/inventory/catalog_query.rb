module Clinic
  module Inventory
    class CatalogQuery
      Result = Data.define(:product_count, :active_count, :low_count, :low_stock,
        :unit_totals, :attention, :movements, :profile, :query, :filter, :page, :filtered_count, :filtered)
      TABLE_PAGE_SIZE = 20
      TableResult = Data.define(:products, :total_count, :filtered_count, :query, :status, :sort, :page, :page_count, :attention, :attention_count)
      ReplenishmentResult = Data.define(:products, :cart, :query, :mode, :page, :page_count, :total_count, :filtered_count, :product_id)

      def self.replenishment(practice:, actor:, query: nil, mode: nil, page: nil, product_id: nil)
        query = query.to_s.strip
        mode = mode.presence || "needed"
        raise ArgumentError, "Search must be 100 characters or fewer." if query.length > 100
        raise ArgumentError, "Choose a supported planning view." unless %w[needed all].include?(mode)
        page = page.presence || "1"
        raise ArgumentError, "Choose a valid planning page." unless /\A[1-9][0-9]{0,5}\z/.match?(page.to_s)
        product = PharmacyProduct.where(practice_id: practice.id).find(product_id) if product_id.present?
        stock = PharmacyProduct.where(practice_id: practice.id, active: true).with_stock(practice.inventory_date)
        outstanding = PurchaseOrderLine.where(practice_id: practice.id).joins(:purchase_order, :product)
          .where(clinic_inventory_purchase_orders: { practice_id: practice.id, status: %w[draft submitted approved sent partially_received] })
          .group(:product_id).select(:product_id,
            "SUM(CASE WHEN clinic_inventory_purchase_orders.status IN ('sent','partially_received') AND clinic_inventory_purchase_order_lines.stock_unit=clinic_pharmacy_products.stock_unit THEN GREATEST(ordered_quantity-received_quantity,0)*conversion_factor ELSE 0 END) AS incoming_units",
            "SUM(CASE WHEN clinic_inventory_purchase_orders.status IN ('draft','submitted','approved') AND clinic_inventory_purchase_order_lines.stock_unit=clinic_pharmacy_products.stock_unit THEN GREATEST(ordered_quantity-received_quantity,0)*conversion_factor ELSE 0 END) AS pending_units",
            "COUNT(*) FILTER (WHERE ordered_quantity>received_quantity AND clinic_inventory_purchase_order_lines.stock_unit<>clinic_pharmacy_products.stock_unit) AS unit_mismatch_count")
        cart = PurchaseCart.where(practice_id: practice.id, actor_id: actor.id, status: "draft").includes(items: [ :product, :selected_supplier, :selected_supplier_product ]).first
        draft = PurchaseCartItem.where(practice_id: practice.id, cart_id: cart&.id, status: "draft").group(:product_id).select(:product_id, "SUM(requested_packages) AS draft_packages")
        projected = PharmacyProduct.from("(#{stock.to_sql}) clinic_pharmacy_products")
          .joins("LEFT JOIN (#{outstanding.to_sql}) incoming ON incoming.product_id=clinic_pharmacy_products.id")
          .joins("LEFT JOIN (#{draft.to_sql}) draft ON draft.product_id=clinic_pharmacy_products.id")
          .select("clinic_pharmacy_products.*", "COALESCE(incoming.incoming_units,0) AS incoming_units", "COALESCE(incoming.pending_units,0) AS pending_units",
            "COALESCE(incoming.unit_mismatch_count,0) AS unit_mismatch_count", "COALESCE(draft.draft_packages,0) AS draft_packages",
            "GREATEST(reorder_point-available_stock-COALESCE(incoming.incoming_units,0),0) AS shortage_units")
        summary = PharmacyProduct.from("(#{projected.to_sql}) clinic_pharmacy_products")
        filtered = summary
        filtered = filtered.where(id: product.id) if product
        filtered = filtered.where("shortage_units > 0 OR unit_mismatch_count > 0") if mode == "needed" && !product
        filtered = filtered.where("concat_ws(' ',name,sku,ndc,device_identifier,generic_name) ILIKE ?", "%#{PharmacyProduct.sanitize_sql_like(query)}%") if query.present?
        count = filtered.count
        page_count = [ (count + TABLE_PAGE_SIZE - 1) / TABLE_PAGE_SIZE, 1 ].max
        page = [ page.to_i, page_count ].min
        ReplenishmentResult.new(products: filtered.includes(:preferred_supplier).order(:name, :id).limit(TABLE_PAGE_SIZE).offset((page - 1) * TABLE_PAGE_SIZE).to_a,
          cart: cart, query: query, mode: mode, page: page, page_count: page_count, total_count: summary.count, filtered_count: count, product_id: product&.id&.to_s)
      end

      def self.table(practice:, query: nil, status: nil, sort: nil, page: nil)
        query = query.to_s.strip
        status = status.presence || "all"
        sort = sort.presence || "name"
        raise ArgumentError, "Search must be 100 characters or fewer." if query.length > 100
        raise ArgumentError, "Choose a supported stock status." unless %w[all attention in_range].include?(status)
        ordering = { "name" => "name ASC, id ASC", "available_asc" => "available_stock ASC, name ASC, id ASC", "available_desc" => "available_stock DESC, name ASC, id ASC" }.fetch(sort) { raise ArgumentError, "Choose a supported catalog sort." }
        page = page.presence || "1"
        raise ArgumentError, "Choose a valid catalog page." unless /\A[1-9][0-9]{0,5}\z/.match?(page.to_s)

        stock = PharmacyProduct.where(practice_id: practice.id).with_stock(practice.inventory_date)
        summary = PharmacyProduct.from("(#{stock.to_sql}) clinic_pharmacy_products")
        supplier_join = <<~SQL.squish
          LEFT JOIN clinic_inventory_suppliers catalog_supplier ON catalog_supplier.practice_id = clinic_pharmacy_products.practice_id
          AND catalog_supplier.id = COALESCE(clinic_pharmacy_products.preferred_supplier_id, (
            SELECT receipt.supplier_id FROM clinic_inventory_receipts receipt
            JOIN clinic_inventory_receipt_lines line ON line.receipt_id = receipt.id AND line.practice_id = receipt.practice_id
            JOIN clinic_pharmacy_batches batch ON batch.id = line.batch_id AND batch.practice_id = receipt.practice_id
            WHERE batch.product_id = clinic_pharmacy_products.id AND receipt.practice_id = clinic_pharmacy_products.practice_id
            ORDER BY receipt.received_at DESC, receipt.id DESC LIMIT 1))
        SQL
        filtered = summary.joins(supplier_join)
        if query.present?
          pattern = "%#{PharmacyProduct.sanitize_sql_like(query)}%"
          filtered = filtered.where(<<~SQL.squish, pattern: pattern)
            concat_ws(' ', clinic_pharmacy_products.name, ndc, device_identifier, sku, generic_name, catalog_supplier.name, 'pkg_' || clinic_pharmacy_products.id) ILIKE :pattern
            OR EXISTS (SELECT 1 FROM clinic_inventory_lots lot WHERE lot.product_id = clinic_pharmacy_products.id AND lot.practice_id = clinic_pharmacy_products.practice_id AND lot.number ILIKE :pattern)
            OR EXISTS (SELECT 1 FROM clinic_pharmacy_batches batch JOIN clinic_inventory_locations location ON location.id = batch.location_id AND location.practice_id = batch.practice_id
              WHERE batch.product_id = clinic_pharmacy_products.id AND batch.practice_id = clinic_pharmacy_products.practice_id AND location.name ILIKE :pattern)
          SQL
        end
        filtered = filtered.where("available_stock <= reorder_point") if status == "attention"
        filtered = filtered.where("available_stock > reorder_point") if status == "in_range"
        filtered_count = filtered.count
        page_count = [ (filtered_count + TABLE_PAGE_SIZE - 1) / TABLE_PAGE_SIZE, 1 ].max
        page = [ page.to_i, page_count ].min
        active_holds = Hold.active.where(practice_id: practice.id).joins(:batch)
        attention = Lot.where(practice_id: practice.id, id: active_holds.select("clinic_pharmacy_batches.lot_id"))
        recalled_lots = active_holds.where(kind: "recalled").select("clinic_pharmacy_batches.lot_id")

        TableResult.new(products: filtered.select("clinic_pharmacy_products.*", "catalog_supplier.name AS catalog_supplier_name", "catalog_supplier.id AS catalog_supplier_id")
            .order(Arel.sql(ordering.split(", ").map { |term| "clinic_pharmacy_products.#{term}" }.join(", "))).limit(TABLE_PAGE_SIZE).offset((page - 1) * TABLE_PAGE_SIZE).to_a,
          total_count: summary.count, filtered_count: filtered_count, query: query, status: status, sort: sort, page: page, page_count: page_count,
          attention_count: attention.count, attention: attention.joins(:product).select("clinic_inventory_lots.*", "clinic_pharmacy_products.name AS product_name",
            "CASE WHEN clinic_inventory_lots.id IN (#{recalled_lots.to_sql}) THEN 'recalled' ELSE 'quarantined' END AS hold_status")
            .order(:expires_on, :id).limit(TABLE_PAGE_SIZE).to_a)
      end

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
