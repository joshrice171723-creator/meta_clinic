module Clinic
  module Reports
    class SourcePage
      def self.call(scope:, page:)
        total = scope.count
        total_pages = (total / 25.0).ceil
        page = [ [ Integer(page), 1 ].max, [ total_pages, 1 ].max ].min
        [ scope.limit(25).offset((page - 1) * 25),
          { page:, per_page: 25, total:, total_pages: } ]
      end
    end
  end
end
