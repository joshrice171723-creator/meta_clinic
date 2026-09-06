module Clinic
  module Inventory
    class ReceivingQuery
      PAGE_SIZE = 25
      RECONCILED_SQL = "EXISTS (SELECT 1 FROM clinic_inventory_shipment_reconciliations r WHERE r.shipment_id=clinic_inventory_shipments.id) OR EXISTS (SELECT 1 FROM clinic_inventory_receipts r WHERE r.shipment_id=clinic_inventory_shipments.id)".freeze
      Result = Data.define(:rows, :selected, :query, :status, :page, :page_count, :total_count, :filtered_count)

      def self.call(practice:, query: nil, status: nil, page: nil, shipment_id: nil)
        query = query.to_s.strip
        status = status.presence || "open"
        raise ArgumentError, "Search must be 100 characters or fewer." if query.length > 100
        raise ArgumentError, "Choose a supported delivery status." unless %w[all open reconciled].include?(status)
        page = page.presence || "1"
        raise ArgumentError, "Choose a valid delivery page." unless /\A[1-9][0-9]{0,5}\z/.match?(page.to_s)
        scope = Shipment.where(practice_id: practice.id)
        filtered = scope.left_joins(purchase_order: :supplier)
        filtered = filtered.where("NOT (#{RECONCILED_SQL})") if status == "open"
        filtered = filtered.where(RECONCILED_SQL) if status == "reconciled"
        if query.present?
          filtered = filtered.where("concat_ws(' ',clinic_inventory_shipments.supplier_reference,clinic_inventory_purchase_orders.number,clinic_inventory_suppliers.name) ILIKE ?", "%#{Shipment.sanitize_sql_like(query)}%")
        end
        count = filtered.count
        page_count = [ (count + PAGE_SIZE - 1) / PAGE_SIZE, 1 ].max
        page = [ page.to_i, page_count ].min
        rows = filtered.select("clinic_inventory_shipments.*", "clinic_inventory_purchase_orders.number AS order_number", "clinic_inventory_suppliers.name AS supplier_name",
          "CASE WHEN #{RECONCILED_SQL} THEN 'reconciled' ELSE 'open' END AS receiving_state")
          .order(id: :desc).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).to_a
        selected = shipment_id.present? ? scope.find(shipment_id) : rows.first
        Result.new(rows: rows, selected: selected, query: query, status: status, page: page, page_count: page_count, total_count: scope.count, filtered_count: count)
      end
    end
  end
end
