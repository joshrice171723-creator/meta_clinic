module Clinic
  module Inventory
    class LocationQuery
      PAGE_SIZE = 25
      Result = Data.define(:ids, :query, :status, :page, :page_count, :total_count, :filtered_count)

      def self.call(practice:, query: nil, status: nil, page: nil)
        query = query.to_s.strip
        status = status.presence || "all"
        raise ArgumentError, "Search must be 100 characters or fewer." if query.length > 100
        raise ArgumentError, "Choose a supported location status." unless %w[all active retired].include?(status)
        page = page.presence || "1"
        raise ArgumentError, "Choose a valid location page." unless /\A[1-9][0-9]{0,5}\z/.match?(page.to_s)
        scope = Location.where(practice_id: practice.id)
        filtered = status == "all" ? scope : scope.where(status: status)
        if query.present?
          practice_id = Location.connection.quote(practice.id)
          paths = <<~SQL.squish
            WITH RECURSIVE inventory_paths(id, path) AS (
              SELECT id, name::text FROM clinic_inventory_locations WHERE practice_id=#{practice_id} AND parent_location_id IS NULL
              UNION ALL
              SELECT child.id, parent.path || ' / ' || child.name FROM clinic_inventory_locations child
              JOIN inventory_paths parent ON child.parent_location_id=parent.id WHERE child.practice_id=#{practice_id}
            ) SELECT id, path FROM inventory_paths
          SQL
          filtered = filtered.left_joins(:site).joins("LEFT JOIN (#{paths}) inventory_path ON inventory_path.id=clinic_inventory_locations.id")
            .where("concat_ws(' ',inventory_path.path,clinic_inventory_locations.kind,clinic_sites.name,clinic_inventory_locations.address_line1,clinic_inventory_locations.address_line2,clinic_inventory_locations.city,clinic_inventory_locations.state,clinic_inventory_locations.postal_code) ILIKE ?", "%#{Location.sanitize_sql_like(query)}%")
        end
        count = filtered.count
        page_count = [ (count + PAGE_SIZE - 1) / PAGE_SIZE, 1 ].max
        page = [ page.to_i, page_count ].min
        Result.new(ids: filtered.order(:name, :id).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).pluck(:id),
          query: query, status: status, page: page, page_count: page_count, total_count: scope.count, filtered_count: count)
      end
    end
  end
end
