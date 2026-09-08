module Clinic
  module Api
    module Pagination
      private

      def paginate(scope, key:, serializer:, order: { id: :desc }, default_per_page: 25, maximum: 100)
        page = page_param
        per_page = per_page_param(default: default_per_page, maximum: maximum)
        total = scope.count
        records = scope.order(order).limit(per_page).offset((page - 1) * per_page)

        render json: {
          key => records.map { |record| serializer.call(record) },
          pagination: {
            page: page,
            per_page: per_page,
            total: total,
            total_pages: total.zero? ? 0 : (total.to_f / per_page).ceil
          }
        }
      end

      def paginated_records(scope, order: { id: :desc }, default_per_page: 25, maximum: 100)
        page = page_param
        per_page = per_page_param(default: default_per_page, maximum: maximum)
        total = scope.count
        [ scope.order(order).limit(per_page).offset((page - 1) * per_page), {
          page: page,
          per_page: per_page,
          total: total,
          total_pages: total.zero? ? 0 : (total.to_f / per_page).ceil
        } ]
      end
    end
  end
end
