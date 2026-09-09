module Clinic
  module Inventory
    class ActivityQuery
      PAGE_SIZE = 50
      Result = Data.define(:movements, :total_count, :filtered_count, :query, :before_cursor, :next_cursor, :lot)

      def self.call(practice:, query: nil, before: nil, lot_id: nil)
        query = query.to_s.strip
        raise ArgumentError, "Keep ledger searches within 100 characters." if query.length > 100
        before = before.to_s.presence
        if before && (!before.match?(/\A[1-9]\d{0,18}\z/) || before.to_i > 9_223_372_036_854_775_807)
          raise ArgumentError, "Reload the ledger to obtain a valid page cursor."
        end

        scope = PharmacyMovement.where(practice_id: practice.id)
        table = PharmacyMovement.table_name
        receipt_table = ReceiptLine.table_name
        filtered = scope.left_joins(:receipt_line)
        lot = Lot.where(practice_id: practice.id).find(lot_id) if lot_id.present?
        filtered = filtered.joins(:batch).where(clinic_pharmacy_batches: { lot_id: lot.id }) if lot
        if query.present?
          filtered = filtered.where("concat_ws(' ',#{table}.kind,#{table}.reason,CASE WHEN #{receipt_table}.id IS NOT NULL THEN 'receipt_' || #{receipt_table}.receipt_id::text ELSE #{table}.request_key END) ILIKE ?",
            "%#{PharmacyMovement.sanitize_sql_like(query)}%")
        end
        total_count = scope.count
        filtered_count = filtered.count
        page = before ? filtered.where("#{table}.id < ?", before.to_i) : filtered
        rows = page.includes(
          :actor,
          { batch: %i[lot location_record] },
          { receipt_line: :receipt },
          { medication_administration_movement: { medication_administration: :encounter } }
        ).order(id: :desc).limit(PAGE_SIZE + 1).to_a
        more = rows.length > PAGE_SIZE
        rows = rows.first(PAGE_SIZE)
        Result.new(movements: rows, total_count: total_count, filtered_count: filtered_count, query: query,
          before_cursor: before, next_cursor: more ? rows.last.id.to_s : nil, lot: lot)
      end
    end
  end
end
