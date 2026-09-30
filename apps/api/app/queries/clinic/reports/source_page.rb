module Clinic
  module Reports
    class SourcePage
      def self.call(scope:, page:, export_limit: nil, export_deadline: nil)
        check_export_deadline!(deadline: export_deadline)
        total = scope.count
        check_export_deadline!(deadline: export_deadline)
        unless export_limit.nil?
          check_export_limit!(total:, export_limit:)
          # Export callers hold one source snapshot; return every matching row,
          # with the original query owner supplying deterministic ordering.
          return [ scope, { page: 1, per_page: [ total, 1 ].max, total:, total_pages: total.zero? ? 0 : 1 } ]
        end
        total_pages = (total / 25.0).ceil
        page = [ [ Integer(page), 1 ].max, [ total_pages, 1 ].max ].min
        [ scope.limit(25).offset((page - 1) * 25),
          { page:, per_page: 25, total:, total_pages: } ]
      end

      def self.check_export_deadline!(deadline:)
        return if deadline.nil?
        return if Process.clock_gettime(Process::CLOCK_MONOTONIC) < deadline

        raise ExportSource::LimitExceeded, "The complete export exceeded its capture time limit. No artifact was issued."
      end

      def self.check_export_limit!(total:, export_limit:)
        limit = Integer(export_limit)
        raise ArgumentError, "Export row limit must be nonnegative." if limit.negative?
        raise ExportSource::LimitExceeded, "The complete filtered report exceeds the export row limit." if total > limit
      end
    end
  end
end
