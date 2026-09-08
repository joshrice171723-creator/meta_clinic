module Clinic
  module Inventory
    class PurchaseOrdersQuery
      PAGE_SIZE = 10
      GROUP_SQL = "COALESCE(clinic_inventory_purchase_orders.checkout_group_id::text, 'order:' || clinic_inventory_purchase_orders.id::text)".freeze
      Result = Data.define(:orders, :query, :status, :page, :page_count, :total_groups, :filtered_groups, :total_orders, :matching_orders)

      def self.call(practice:, query: nil, status: nil, page: nil)
        query = query.to_s.strip
        status = status.presence || "all"
        raise ArgumentError, "Search must be 100 characters or fewer." if query.length > 100
        raise ArgumentError, "Choose a supported order status." unless ([ "all" ] + PurchaseOrder::STATUSES).include?(status)
        page = page.presence || "1"
        raise ArgumentError, "Choose a valid purchase page." unless /\A[1-9][0-9]{0,5}\z/.match?(page.to_s)
        scope = PurchaseOrder.where(practice_id: practice.id)
        filtered = scope.left_joins(:supplier)
        filtered = filtered.where(status: status) unless status == "all"
        if query.present?
          filtered = filtered.where(<<~SQL.squish, pattern: "%#{PurchaseOrder.sanitize_sql_like(query)}%")
            concat_ws(' ',clinic_inventory_purchase_orders.number,clinic_inventory_purchase_orders.checkout_group_id,clinic_inventory_purchase_orders.destination,clinic_inventory_suppliers.name) ILIKE :pattern
            OR EXISTS (SELECT 1 FROM clinic_inventory_purchase_order_lines line
              WHERE line.purchase_order_id=clinic_inventory_purchase_orders.id AND line.practice_id=clinic_inventory_purchase_orders.practice_id AND line.product_name ILIKE :pattern)
          SQL
        end
        filtered_groups = filtered.distinct.count(Arel.sql(GROUP_SQL))
        page_count = [ (filtered_groups + PAGE_SIZE - 1) / PAGE_SIZE, 1 ].max
        page = [ page.to_i, page_count ].min
        keys = filtered.group(Arel.sql(GROUP_SQL)).order(Arel.sql("MAX(clinic_inventory_purchase_orders.id) DESC"))
          .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).pluck(Arel.sql(GROUP_SQL))
        # Select complete groups after matching; otherwise supplier totals and
        # group status would silently describe only the matching supplier.
        orders = scope.where("#{GROUP_SQL} IN (?)", keys).includes(:supplier, lines: :product).order(id: :desc).to_a
        Result.new(orders: orders, query: query, status: status, page: page, page_count: page_count,
          total_groups: scope.distinct.count(Arel.sql(GROUP_SQL)), filtered_groups: filtered_groups, total_orders: scope.count, matching_orders: filtered.count)
      end
    end
  end
end
