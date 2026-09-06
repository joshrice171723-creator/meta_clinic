module Clinic
  module Inventory
    class ControlledCountsQuery
      PAGE_SIZE = 25
      Result = Data.define(:counts, :cutoffs, :query, :status, :page, :page_count, :total_count, :filtered_count)

      def self.call(practice:, query: nil, status: nil, page: nil)
        query = query.to_s.strip
        status = status.presence || "pending"
        raise ArgumentError, "Search must be 100 characters or fewer." if query.length > 100
        raise ArgumentError, "Choose a supported review status." unless %w[all pending certified].include?(status)
        page = page.presence || "1"
        raise ArgumentError, "Choose a valid count page." unless /\A[1-9][0-9]{0,5}\z/.match?(page.to_s)
        base = Count.where(practice_id: practice.id).joins(batch: :product).where.not(clinic_pharmacy_products: { dea_schedule: nil })
        filtered = base
        certification = ControlReview.where(practice_id: practice.id, kind: "certification").select(:count_id)
        filtered = filtered.where(id: certification) if status == "certified"
        filtered = filtered.where.not(id: certification) if status == "pending"
        if query.present?
          filtered = filtered.where("concat_ws(' ',clinic_pharmacy_products.name,clinic_pharmacy_products.ndc,clinic_pharmacy_batches.lot_number,clinic_pharmacy_batches.location) ILIKE ?", "%#{Count.sanitize_sql_like(query)}%")
        end
        count = filtered.count
        page_count = [ (count + PAGE_SIZE - 1) / PAGE_SIZE, 1 ].max
        page = [ page.to_i, page_count ].min
        current_session = <<~SQL.squish
          clinic_inventory_counts.count_session_line_id IS NULL OR EXISTS (
            SELECT 1 FROM clinic_inventory_count_session_lines session_line
            JOIN clinic_inventory_count_sessions session ON session.id=session_line.count_session_id AND session.practice_id=session_line.practice_id
            WHERE session_line.id=clinic_inventory_counts.count_session_line_id AND session_line.practice_id=clinic_inventory_counts.practice_id
              AND session.status<>'cancelled'
              AND clinic_inventory_counts.id=(SELECT MAX(latest.id) FROM clinic_inventory_counts latest WHERE latest.count_session_line_id=session_line.id AND latest.practice_id=session_line.practice_id)
              AND clinic_inventory_counts.id=(SELECT event.count_id FROM clinic_inventory_count_session_events event WHERE event.count_session_line_id=session_line.id AND event.practice_id=session_line.practice_id ORDER BY event.id DESC LIMIT 1)
          )
        SQL
        counts = filtered.select("clinic_inventory_counts.*", "(#{current_session}) AS session_current").includes(:approval, batch: [ :product, :lot, :location_record ]).order(id: :desc).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).to_a
        cutoffs = Entry.where(practice_id: practice.id, stock_type: "pharmacy", batch_id: counts.map(&:batch_id)).group(:batch_id).maximum(:id)
        Result.new(counts: counts, cutoffs: cutoffs, query: query, status: status, page: page, page_count: page_count, total_count: base.count, filtered_count: count)
      end
    end
  end
end
