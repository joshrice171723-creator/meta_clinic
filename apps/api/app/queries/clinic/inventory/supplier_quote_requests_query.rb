module Clinic
  module Inventory
    class SupplierQuoteRequestsQuery
      PAGE_SIZE = 25
      Result = Data.define(:requests, :status, :page, :page_count, :total_count, :filtered_count)

      def self.call(practice:, supplier_id: nil, status: nil, page: nil)
        status = status.presence || "all"
        raise ArgumentError, "Choose a valid quote request status." unless %w[all open quoted].include?(status)
        page = page.presence || "1"
        raise ArgumentError, "Choose a valid quote request page." unless /\A[1-9][0-9]{0,5}\z/.match?(page.to_s)

        scope = SupplierQuoteRequest.where(practice_id: practice.id)
        scope = scope.where(supplier_id: supplier_id) if supplier_id.present?
        filtered = status == "all" ? scope : scope.where(status: status)
        count = filtered.count
        page_count = [ (count + PAGE_SIZE - 1) / PAGE_SIZE, 1 ].max
        page = [ page.to_i, page_count ].min
        Result.new(requests: filtered.includes(:supplier, :product).order(created_at: :desc, id: :desc)
          .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).to_a,
          status:, page:, page_count:, total_count: scope.count, filtered_count: count)
      end
    end
  end
end
