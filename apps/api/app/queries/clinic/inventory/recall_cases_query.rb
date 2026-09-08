module Clinic
  module Inventory
    class RecallCasesQuery
      PAGE_SIZE = 25
      POSITION_PAGE_SIZE = 25
      HISTORY_PAGE_SIZE = 25
      LOT_PAGE_SIZE = 25
      MAX_RECORD_ID = 9_223_372_036_854_775_807
      STATUSES = %w[all open closed].freeze

      Result = Data.define(
        :cases, :selected, :positions, :dispositions, :lot_options,
        :query, :status, :page, :page_count, :total_count, :filtered_count,
        :position_page, :position_page_count, :position_count,
        :history_page, :history_page_count, :history_count,
        :lot_query, :lot_page, :lot_page_count, :lot_count, :product_id
      )

      def self.call(practice:, query: nil, status: nil, page: nil, recall_id: nil,
        position_page: nil, history_page: nil, lot_query: nil, lot_page: nil, product_id: nil)
        query = normalized_query(query, "Recall search")
        lot_query = normalized_query(lot_query, "Lot search")
        status = status.presence || "open"
        raise ArgumentError, "Choose a supported recall status." unless STATUSES.include?(status)

        page = normalized_page(page, "recall")
        position_page = normalized_page(position_page, "recall position")
        history_page = normalized_page(history_page, "recall history")
        lot_page = normalized_page(lot_page, "lot")

        base = Recall.where(practice_id: practice.id)
        selected = if recall_id.present?
          with_case_totals(base).includes(:product, :closure).find(normalized_id(recall_id, "recall"))
        end
        product = if product_id.present?
          PharmacyProduct.where(practice_id: practice.id).find(normalized_id(product_id, "product"))
        end

        filtered = filter_cases(base, status: status, query: query)
        filtered_count = filtered.count
        page_count = pages_for(filtered_count, PAGE_SIZE)
        page = [ page, page_count ].min
        cases = with_case_totals(filtered).includes(:product, :closure)
          .order(effective_on: :desc, id: :desc).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).to_a

        position_scope = if selected
          PharmacyBatch.where(practice_id: practice.id,
            lot_id: RecallLot.where(practice_id: practice.id, recall_id: selected.id).select(:lot_id))
        else
          PharmacyBatch.none
        end
        position_count = position_scope.count
        position_page_count = pages_for(position_count, POSITION_PAGE_SIZE)
        position_page = [ position_page, position_page_count ].min
        positions = position_scope.includes(:lot, :location_record)
          .order(Arel.sql("CASE WHEN clinic_pharmacy_batches.on_hand > 0 THEN 0 ELSE 1 END"), :expires_on, :id)
          .limit(POSITION_PAGE_SIZE).offset((position_page - 1) * POSITION_PAGE_SIZE).to_a

        disposition_scope = selected ? RecallDisposition.where(practice_id: practice.id, recall_id: selected.id) : RecallDisposition.none
        history_count = disposition_scope.count
        history_page_count = pages_for(history_count, HISTORY_PAGE_SIZE)
        history_page = [ history_page, history_page_count ].min
        dispositions = disposition_scope.order(id: :desc).limit(HISTORY_PAGE_SIZE)
          .offset((history_page - 1) * HISTORY_PAGE_SIZE).to_a

        lot_scope = Lot.where(practice_id: practice.id).joins(:product)
        lot_scope = lot_scope.where(product_id: product.id) if product
        if lot_query.present?
          pattern = "%#{Lot.sanitize_sql_like(lot_query)}%"
          lot_scope = lot_scope.where(
            "concat_ws(' ',clinic_inventory_lots.number,clinic_pharmacy_products.name) ILIKE ?", pattern)
        end
        lot_count = lot_scope.count
        lot_page_count = pages_for(lot_count, LOT_PAGE_SIZE)
        lot_page = [ lot_page, lot_page_count ].min
        lot_options = lot_scope.includes(:product).order("clinic_pharmacy_products.name", :number, :id)
          .limit(LOT_PAGE_SIZE).offset((lot_page - 1) * LOT_PAGE_SIZE).to_a

        Result.new(
          cases: cases, selected: selected, positions: positions, dispositions: dispositions, lot_options: lot_options,
          query: query, status: status, page: page, page_count: page_count, total_count: base.count, filtered_count: filtered_count,
          position_page: position_page, position_page_count: position_page_count, position_count: position_count,
          history_page: history_page, history_page_count: history_page_count, history_count: history_count,
          lot_query: lot_query, lot_page: lot_page, lot_page_count: lot_page_count, lot_count: lot_count,
          product_id: product&.id&.to_s
        )
      end

      def self.filter_cases(scope, status:, query:)
        closure_exists = <<~SQL.squish
          EXISTS (
            SELECT 1 FROM clinic_inventory_recall_closures recall_closure
            WHERE recall_closure.practice_id=clinic_inventory_recalls.practice_id
              AND recall_closure.recall_id=clinic_inventory_recalls.id
          )
        SQL
        scope = case status
        when "open"
          scope.where.not(status: "closed").where("NOT (#{closure_exists})")
        when "closed"
          scope.where("clinic_inventory_recalls.status='closed' OR #{closure_exists}")
        else
          scope
        end
        return scope unless query.present?

        pattern = "%#{Recall.sanitize_sql_like(query)}%"
        scope.joins(:product).where(<<~SQL.squish, pattern: pattern)
          concat_ws(' ',clinic_inventory_recalls.reference,clinic_pharmacy_products.name) ILIKE :pattern
          OR EXISTS (
            SELECT 1
            FROM clinic_inventory_recall_lots recall_lot
            JOIN clinic_inventory_lots lot
              ON lot.practice_id=recall_lot.practice_id AND lot.id=recall_lot.lot_id
            WHERE recall_lot.practice_id=clinic_inventory_recalls.practice_id
              AND recall_lot.recall_id=clinic_inventory_recalls.id
              AND lot.number ILIKE :pattern
          )
        SQL
      end
      private_class_method :filter_cases

      def self.with_case_totals(scope)
        scope.select(
          "clinic_inventory_recalls.*",
          "(#{linked_lot_count_sql}) AS linked_lot_count",
          "(#{position_count_sql}) AS case_position_count",
          "(#{on_hand_units_sql}) AS on_hand_units",
          "(#{held_units_sql}) AS held_units",
          "((#{on_hand_units_sql}) - (#{held_units_sql})) AS uncontained_units",
          "(#{disposed_units_sql}) AS disposed_units",
          "(#{closure_id_sql}) AS closure_id",
          "(#{closed_at_sql}) AS closed_at"
        )
      end
      private_class_method :with_case_totals

      def self.linked_lot_count_sql
        <<~SQL.squish
          SELECT COUNT(*) FROM clinic_inventory_recall_lots recall_lot
          WHERE recall_lot.practice_id=clinic_inventory_recalls.practice_id
            AND recall_lot.recall_id=clinic_inventory_recalls.id
        SQL
      end
      private_class_method :linked_lot_count_sql

      def self.position_count_sql
        <<~SQL.squish
          SELECT COUNT(*) FROM clinic_pharmacy_batches batch
          WHERE batch.practice_id=clinic_inventory_recalls.practice_id
            AND EXISTS (
              SELECT 1 FROM clinic_inventory_recall_lots recall_lot
              WHERE recall_lot.practice_id=batch.practice_id
                AND recall_lot.recall_id=clinic_inventory_recalls.id
                AND recall_lot.lot_id=batch.lot_id
            )
        SQL
      end
      private_class_method :position_count_sql

      def self.on_hand_units_sql
        <<~SQL.squish
          SELECT COALESCE(SUM(batch.on_hand),0) FROM clinic_pharmacy_batches batch
          WHERE batch.practice_id=clinic_inventory_recalls.practice_id
            AND EXISTS (
              SELECT 1 FROM clinic_inventory_recall_lots recall_lot
              WHERE recall_lot.practice_id=batch.practice_id
                AND recall_lot.recall_id=clinic_inventory_recalls.id
                AND recall_lot.lot_id=batch.lot_id
            )
        SQL
      end
      private_class_method :on_hand_units_sql

      def self.held_units_sql
        <<~SQL.squish
          SELECT COALESCE(SUM(batch.on_hand),0) FROM clinic_pharmacy_batches batch
          WHERE batch.practice_id=clinic_inventory_recalls.practice_id
            AND EXISTS (
              SELECT 1 FROM clinic_inventory_recall_lots recall_lot
              WHERE recall_lot.practice_id=batch.practice_id
                AND recall_lot.recall_id=clinic_inventory_recalls.id
                AND recall_lot.lot_id=batch.lot_id
            )
            AND EXISTS (
              SELECT 1 FROM clinic_inventory_holds recall_hold
              WHERE recall_hold.practice_id=batch.practice_id
                AND recall_hold.batch_id=batch.id
                AND recall_hold.kind='recalled'
                AND recall_hold.recall_id=clinic_inventory_recalls.id
                AND NOT EXISTS (
                  SELECT 1 FROM clinic_inventory_hold_releases hold_release
                  WHERE hold_release.practice_id=recall_hold.practice_id
                    AND hold_release.hold_id=recall_hold.id
                )
            )
        SQL
      end
      private_class_method :held_units_sql

      def self.disposed_units_sql
        <<~SQL.squish
          SELECT COALESCE(SUM(disposition.quantity),0) FROM clinic_inventory_recall_dispositions disposition
          WHERE disposition.practice_id=clinic_inventory_recalls.practice_id
            AND disposition.recall_id=clinic_inventory_recalls.id
        SQL
      end
      private_class_method :disposed_units_sql

      def self.closure_id_sql
        <<~SQL.squish
          SELECT recall_closure.id FROM clinic_inventory_recall_closures recall_closure
          WHERE recall_closure.practice_id=clinic_inventory_recalls.practice_id
            AND recall_closure.recall_id=clinic_inventory_recalls.id
          LIMIT 1
        SQL
      end
      private_class_method :closure_id_sql

      def self.closed_at_sql
        <<~SQL.squish
          SELECT recall_closure.created_at FROM clinic_inventory_recall_closures recall_closure
          WHERE recall_closure.practice_id=clinic_inventory_recalls.practice_id
            AND recall_closure.recall_id=clinic_inventory_recalls.id
          LIMIT 1
        SQL
      end
      private_class_method :closed_at_sql

      def self.normalized_query(value, label)
        query = value.to_s.strip
        raise ArgumentError, "#{label} must be 100 characters or fewer." if query.length > 100

        query
      end
      private_class_method :normalized_query

      def self.normalized_page(value, label)
        value = value.presence || "1"
        raise ArgumentError, "Choose a valid #{label} page." unless /\A[1-9][0-9]{0,5}\z/.match?(value.to_s)

        value.to_i
      end
      private_class_method :normalized_page

      def self.normalized_id(value, label)
        value = value.to_s
        id = Integer(value, 10) if /\A[1-9][0-9]{0,18}\z/.match?(value)
        raise ArgumentError, "Choose a valid #{label}." unless id&.between?(1, MAX_RECORD_ID)

        id
      end
      private_class_method :normalized_id

      def self.pages_for(count, page_size)
        [ (count + page_size - 1) / page_size, 1 ].max
      end
      private_class_method :pages_for
    end
  end
end
