module Clinic
  module Inventory
    class ExceptionQueueQuery
      PAGE_SIZE = 25
      Result = Data.define(:rows, :query, :status, :category, :page, :page_count, :total_count, :filtered_count)
      SOURCES_SQL = <<~SQL.freeze
        SELECT 'batch'::text AS source_kind, clinic_pharmacy_batches.id AS source_id, flag.category,
          CASE flag.category WHEN 'expired' THEN 'Expired stock' WHEN 'expiring' THEN 'Expiring within 30 days'
            WHEN 'inactive_product' THEN 'Inactive catalog item with stock' ELSE 'Stock at an inactive destination' END AS title,
          product.id AS product_id, product.name AS product_name, clinic_pharmacy_batches.lot_number,
          clinic_pharmacy_batches.location_id, clinic_pharmacy_batches.expires_on,
          clinic_pharmacy_batches.on_hand AS quantity_units, product.stock_unit,
          clinic_pharmacy_batches.location::text AS details, NULL::bigint AS shipment_id, flag.priority,
          GREATEST(clinic_pharmacy_batches.updated_at, product.updated_at, destination.updated_at, site.updated_at) AS source_changed_at
        FROM clinic_pharmacy_batches
        JOIN clinic_pharmacy_products product ON product.id=clinic_pharmacy_batches.product_id AND product.practice_id=clinic_pharmacy_batches.practice_id
        JOIN clinic_inventory_locations destination ON destination.id=clinic_pharmacy_batches.location_id AND destination.practice_id=clinic_pharmacy_batches.practice_id
        LEFT JOIN clinic_sites site ON site.id=destination.site_id AND site.practice_id=destination.practice_id
        CROSS JOIN LATERAL (VALUES
          ('expired', clinic_pharmacy_batches.expires_on < :day, 1),
          ('expiring', clinic_pharmacy_batches.expires_on BETWEEN :day AND :horizon, 4),
          ('inactive_product', NOT product.active, 2),
          ('inactive_location', NOT (#{PharmacyBatch::STOCK_DESTINATION_SQL}), 2)
        ) flag(category, applies, priority)
        WHERE clinic_pharmacy_batches.practice_id=:practice_id AND clinic_pharmacy_batches.on_hand>0 AND flag.applies
        UNION ALL
        SELECT 'hold', hold.id, 'hold', 'Held stock: ' || hold.kind,
          product.id, product.name, batch.lot_number, batch.location_id, batch.expires_on,
          batch.on_hand, product.stock_unit, hold.reason, NULL::bigint, 0, GREATEST(hold.updated_at, batch.updated_at)
        FROM clinic_inventory_holds hold
        JOIN clinic_pharmacy_batches batch ON batch.id=hold.batch_id AND batch.practice_id=hold.practice_id
        JOIN clinic_pharmacy_products product ON product.id=batch.product_id AND product.practice_id=batch.practice_id
        WHERE hold.practice_id=:practice_id AND batch.on_hand>0
          AND NOT EXISTS (SELECT 1 FROM clinic_inventory_hold_releases hold_release WHERE hold_release.hold_id=hold.id)
        UNION ALL
        SELECT 'reconciliation', reconciliation.id, 'delivery_discrepancy', 'Delivery discrepancy: ' || reconciliation.exception,
          NULL::bigint, NULL::text, NULL::text, NULL::bigint, NULL::date, NULL::numeric, NULL::text,
          concat_ws(' ', 'Order', purchase_order.number, 'Delivery', shipment.supplier_reference,
            'Accepted packages', reconciliation.accepted_packages, 'Missing', reconciliation.missing_packages,
            'Rejected', reconciliation.rejected_packages, 'Excess refused', reconciliation.excess_packages, reconciliation.reason),
          shipment.id, 3, reconciliation.created_at
        FROM clinic_inventory_shipment_reconciliations reconciliation
        JOIN clinic_inventory_shipments shipment ON shipment.id=reconciliation.shipment_id AND shipment.practice_id=reconciliation.practice_id
        JOIN clinic_inventory_purchase_orders purchase_order ON purchase_order.id=shipment.purchase_order_id AND purchase_order.practice_id=shipment.practice_id
        WHERE reconciliation.practice_id=:practice_id
      SQL
      JOINED_SQL = <<~SQL.freeze
        FROM (#{SOURCES_SQL}) exception
        LEFT JOIN (
          SELECT DISTINCT ON (source_kind,source_id,category) * FROM clinic_inventory_exception_reviews
          WHERE practice_id=:practice_id ORDER BY source_kind,source_id,category,id DESC
        ) review ON review.source_kind=exception.source_kind AND review.source_id=exception.source_id
          AND review.category=exception.category AND review.created_at>=exception.source_changed_at
      SQL
      FILTER_SQL = <<~SQL.freeze
        WHERE (:category='all' OR exception.category=:category)
          AND (:status='all' OR COALESCE(review.state,'open')=:review_state)
          AND (:query='' OR concat_ws(' ',exception.title,exception.product_name,exception.lot_number,exception.details) ILIKE :query_pattern)
      SQL
      COUNT_SQL = "SELECT COUNT(*) #{JOINED_SQL} #{FILTER_SQL}".freeze
      TOTAL_SQL = "SELECT COUNT(*) FROM (#{SOURCES_SQL}) exception".freeze
      ROWS_SQL = <<~SQL.freeze
        SELECT exception.*, COALESCE(review.state,'open') AS state, review.assignee_id, review.id AS review_id,
          CASE WHEN review.state='reviewed' THEN review.created_at END AS reviewed_at,
          CASE WHEN review.state='reviewed' THEN review.actor_id END AS reviewed_by,
          review.reason, review.evidence_reference
        #{JOINED_SQL} #{FILTER_SQL}
        ORDER BY exception.priority, exception.expires_on NULLS LAST, exception.source_kind, exception.source_id, exception.category
        LIMIT :limit OFFSET :offset
      SQL

      def self.call(practice:, query: nil, status: nil, category: nil, page: nil)
        query = query.to_s.strip
        status = status.presence || "unreviewed"
        category = category.presence || "all"
        raise ArgumentError, "Search must be 100 characters or fewer." if query.length > 100
        raise ArgumentError, "Choose a supported review status." unless %w[all unreviewed reviewed].include?(status)
        raise ArgumentError, "Choose a supported exception category." unless ([ "all" ] + ExceptionReview::CATEGORIES).include?(category)
        page = page.presence || "1"
        raise ArgumentError, "Choose a valid exception page." unless /\A[1-9][0-9]{0,5}\z/.match?(page.to_s)
        connection = ApplicationRecord.connection
        binds = { practice_id: practice.id, day: practice.inventory_date, horizon: practice.inventory_date + 30,
          category: category, status: status, review_state: status == "reviewed" ? "reviewed" : "open",
          query: query, query_pattern: "%#{PharmacyBatch.sanitize_sql_like(query)}%" }
        count = connection.select_value(ApplicationRecord.sanitize_sql_array([ COUNT_SQL, binds ])).to_i
        page_count = [ (count + PAGE_SIZE - 1) / PAGE_SIZE, 1 ].max
        page = [ page.to_i, page_count ].min
        rows = connection.select_all(ApplicationRecord.sanitize_sql_array(
          [ ROWS_SQL, binds.merge(limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE) ])).to_a
        Result.new(rows: rows, query: query, status: status, category: category, page: page, page_count: page_count,
          total_count: connection.select_value(ApplicationRecord.sanitize_sql_array([ TOTAL_SQL, binds ])).to_i,
          filtered_count: count)
      end
    end
  end
end
