module Clinic
  module Inventory
    class SupplierPricingQuery
      PAGE_SIZE = 25
      Result = Data.define(:offers, :query, :supplier_id, :page, :page_count, :total_count, :filtered_count)

      def self.call(practice:, query: nil, supplier_id: nil, page: nil)
        query = query.to_s.strip
        raise ArgumentError, "Search must be 100 characters or fewer." if query.length > 100
        page = page.presence || "1"
        raise ArgumentError, "Choose a valid supplier price page." unless /\A[1-9][0-9]{0,5}\z/.match?(page.to_s)
        supplier = Supplier.where(practice_id: practice.id).find(supplier_id) if supplier_id.present?
        scope = SupplierProduct.where(practice_id: practice.id)
        filtered = supplier ? scope.where(supplier_id: supplier.id) : scope
        if query.present?
          filtered = filtered.left_joins(:product, :supplier).where(
            "concat_ws(' ',clinic_inventory_supplier_products.ndc,supplier_sku,description,clinic_pharmacy_products.name,clinic_inventory_suppliers.name) ILIKE ?",
            "%#{SupplierProduct.sanitize_sql_like(query)}%")
        end
        count = filtered.count
        page_count = [ (count + PAGE_SIZE - 1) / PAGE_SIZE, 1 ].max
        page = [ page.to_i, page_count ].min
        Result.new(offers: filtered.includes(:supplier, :product).order(:ndc, :supplier_sku, :id).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).to_a,
          query: query, supplier_id: supplier&.id&.to_s, page: page, page_count: page_count, total_count: scope.count, filtered_count: count)
      end
    end
  end
end
