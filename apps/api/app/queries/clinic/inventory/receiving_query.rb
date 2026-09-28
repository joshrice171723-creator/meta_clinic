module Clinic
  module Inventory
    class ReceivingQuery
      PAGE_SIZE = 25
      RECONCILED_SQL = "EXISTS (SELECT 1 FROM clinic_inventory_shipment_reconciliations r WHERE r.shipment_id=clinic_inventory_shipments.id) OR EXISTS (SELECT 1 FROM clinic_inventory_receipts r WHERE r.shipment_id=clinic_inventory_shipments.id)".freeze
      TRACKING_STATUS_SQL = <<~SQL.squish.freeze
        COALESCE((SELECT e.status FROM clinic_inventory_shipment_events e
          WHERE e.practice_id=clinic_inventory_shipments.practice_id AND e.shipment_id=clinic_inventory_shipments.id
          ORDER BY e.recorded_at DESC, e.id DESC LIMIT 1), clinic_inventory_shipments.status)
      SQL
      Result = Data.define(:rows, :selected, :query, :status, :page, :page_count, :total_count, :filtered_count)
      IntakeResult = Data.define(:orders, :selected, :allocations, :query, :page, :page_count, :total_count, :filtered_count)

      def self.intake(practice:, query: nil, page: nil, purchase_order_id: nil)
        query = query.to_s.strip
        raise ArgumentError, "Search must be 100 characters or fewer." if query.length > 100
        page = page.presence || "1"
        raise ArgumentError, "Choose a valid order page." unless /\A[1-9][0-9]{0,5}\z/.match?(page.to_s)
        if purchase_order_id.present? && !/\A[1-9][0-9]*\z/.match?(purchase_order_id.to_s)
          raise ArgumentError, "Choose a valid purchase order."
        end

        scope = PurchaseOrder.where(practice_id: practice.id, status: %w[sent partially_received])
        filtered = scope.left_joins(:supplier)
        if query.present?
          filtered = filtered.where(<<~SQL.squish, pattern: "%#{PurchaseOrder.sanitize_sql_like(query)}%")
            concat_ws(' ', clinic_inventory_purchase_orders.number, clinic_inventory_purchase_orders.destination, clinic_inventory_suppliers.name) ILIKE :pattern
            OR EXISTS (SELECT 1 FROM clinic_inventory_purchase_order_lines line
              WHERE line.purchase_order_id = clinic_inventory_purchase_orders.id
                AND line.practice_id = clinic_inventory_purchase_orders.practice_id AND line.product_name ILIKE :pattern)
          SQL
        end
        count = filtered.count
        page_count = [ (count + PAGE_SIZE - 1) / PAGE_SIZE, 1 ].max
        page = [ page.to_i, page_count ].min
        orders = filtered.includes(:supplier).order(id: :desc).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).to_a
        selected_id = purchase_order_id.presence || orders.first&.id
        selected = selected_id && scope.includes(:supplier, lines: :product).find(selected_id)
        # Match the locked write's allowance: reconciled/received deliveries no
        # longer reserve packages, while every unreconciled delivery still does.
        allocations = ShipmentLine.where(practice_id: practice.id, purchase_order_line_id: selected&.lines&.map(&:id) || [])
          .where.not(shipment_id: Receipt.where(practice_id: practice.id).where.not(shipment_id: nil).select(:shipment_id))
          .where.not(shipment_id: ShipmentReconciliation.where(practice_id: practice.id).select(:shipment_id))
          .group(:purchase_order_line_id).sum(:expected_packages)
        IntakeResult.new(orders: orders, selected: selected, allocations: allocations, query: query,
          page: page, page_count: page_count, total_count: scope.count, filtered_count: count)
      end

      def self.call(practice:, query: nil, status: nil, page: nil, shipment_id: nil)
        query = query.to_s.strip
        status = status.presence || "open"
        raise ArgumentError, "Search must be 100 characters or fewer." if query.length > 100
        raise ArgumentError, "Choose a supported delivery status." unless %w[all open reconciled].include?(status)
        page = page.presence || "1"
        raise ArgumentError, "Choose a valid delivery page." unless /\A[1-9][0-9]{0,5}\z/.match?(page.to_s)
        scope = Shipment.where(practice_id: practice.id)
        filtered = scope.left_joins(purchase_order: :supplier)
        if status == "open"
          filtered = filtered.where("NOT (#{RECONCILED_SQL})")
            .where("(#{TRACKING_STATUS_SQL}) IN ('delivered','exception')")
        end
        filtered = filtered.where(RECONCILED_SQL) if status == "reconciled"
        if query.present?
          filtered = filtered.where("concat_ws(' ',clinic_inventory_shipments.supplier_reference,clinic_inventory_shipments.carrier,clinic_inventory_shipments.tracking_number,clinic_inventory_purchase_orders.number,clinic_inventory_suppliers.name) ILIKE ?", "%#{Shipment.sanitize_sql_like(query)}%")
        end
        count = filtered.count
        page_count = [ (count + PAGE_SIZE - 1) / PAGE_SIZE, 1 ].max
        page = [ page.to_i, page_count ].min
        rows = filtered.select("clinic_inventory_shipments.*", "clinic_inventory_purchase_orders.number AS order_number", "clinic_inventory_suppliers.name AS supplier_name",
          "CASE WHEN #{RECONCILED_SQL} THEN 'reconciled' ELSE 'open' END AS receiving_state")
          .order(id: :desc).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).to_a
        selected = shipment_id.present? ? filtered.find(shipment_id) : rows.first
        Result.new(rows: rows, selected: selected, query: query, status: status, page: page, page_count: page_count, total_count: scope.count, filtered_count: count)
      end
    end
  end
end
