module Clinic
  module Inventory
    class CountSessionsQuery
      PAGE_SIZE = 25
      LINE_PAGE_SIZE = 25
      HISTORY_PAGE_SIZE = 25
      MAX_RECORD_ID = 9_223_372_036_854_775_807
      STATUSES = %w[all open overdue completed cancelled].freeze

      Result = Data.define(
        :sessions, :selected, :lines, :observations, :line_events, :events, :cutoffs,
        :query, :status, :page, :page_count, :total_count, :filtered_count,
        :line_page, :line_page_count, :line_count,
        :history_page, :history_page_count, :history_count
      )

      def self.call(practice:, actor:, query: nil, status: nil, page: nil, session_id: nil,
        line_page: nil, history_page: nil)
        query = normalized_query(query)
        status = status.presence || "open"
        raise ArgumentError, "Choose a supported count-session status." unless STATUSES.include?(status)

        page = normalized_page(page, "count session")
        line_page = normalized_page(line_page, "count-session line")
        history_page = normalized_page(history_page, "count-session history")

        base = CountSession.where(practice_id: practice.id)
        selected = if session_id.present?
          with_metrics(base).includes(:location, :actor, :assignee).find(normalized_id(session_id, "count session"))
        end

        filtered = filter_sessions(base, practice: practice, status: status, query: query)
        filtered_count = filtered.count
        page_count = pages_for(filtered_count, PAGE_SIZE)
        page = [ page, page_count ].min
        sessions = with_metrics(filtered).includes(:location, :actor, :assignee)
          .order(Arel.sql("CASE clinic_inventory_count_sessions.status WHEN 'open' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END"),
            :due_on, id: :desc)
          .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).to_a

        line_scope = selected ? CountSessionLine.where(practice_id: practice.id, count_session_id: selected.id) : CountSessionLine.none
        line_count = line_scope.count
        line_page_count = pages_for(line_count, LINE_PAGE_SIZE)
        line_page = [ line_page, line_page_count ].min
        lines = line_scope.includes(batch: [ :product, :lot, :location_record ]).order(:id)
          .limit(LINE_PAGE_SIZE).offset((line_page - 1) * LINE_PAGE_SIZE).to_a
        line_ids = lines.map(&:id)

        observations = latest_observations(practice.id, line_ids)
        line_events = latest_line_events(practice.id, line_ids)
        batch_ids = lines.map(&:batch_id)
        latest_cutoffs = Entry.where(practice_id: practice.id, batch_id: batch_ids).group(:batch_id).maximum(:id)
        cutoffs = batch_ids.index_with { |batch_id| latest_cutoffs[batch_id] }

        event_scope = selected ? CountSessionEvent.where(practice_id: practice.id, count_session_id: selected.id) : CountSessionEvent.none
        history_count = event_scope.count
        history_page_count = pages_for(history_count, HISTORY_PAGE_SIZE)
        history_page = [ history_page, history_page_count ].min
        events = event_scope.includes(:actor, :assignee, :count).order(id: :desc)
          .limit(HISTORY_PAGE_SIZE).offset((history_page - 1) * HISTORY_PAGE_SIZE).to_a

        Result.new(
          sessions: sessions, selected: selected, lines: lines, observations: observations,
          line_events: line_events, events: events, cutoffs: cutoffs,
          query: query, status: status, page: page, page_count: page_count,
          total_count: base.count, filtered_count: filtered_count,
          line_page: line_page, line_page_count: line_page_count, line_count: line_count,
          history_page: history_page, history_page_count: history_page_count, history_count: history_count
        )
      end

      def self.filter_sessions(scope, practice:, status:, query:)
        scope = case status
        when "open"
          scope.where(status: "open")
        when "overdue"
          scope.where(status: "open").where("clinic_inventory_count_sessions.due_on < ?", practice.inventory_date)
        when "completed", "cancelled"
          scope.where(status: status)
        else
          scope
        end
        return scope unless query.present?

        pattern = "%#{CountSession.sanitize_sql_like(query)}%"
        scope.joins(:location)
          .joins("LEFT JOIN users count_session_assignees ON count_session_assignees.id=clinic_inventory_count_sessions.assignee_id")
          .where(<<~SQL.squish, pattern)
            concat_ws(' ',clinic_inventory_locations.name,clinic_inventory_count_sessions.reason,
              count_session_assignees.email_address) ILIKE ?
          SQL
      end
      private_class_method :filter_sessions

      def self.with_metrics(scope)
        scope.select(
          "clinic_inventory_count_sessions.*",
          "(#{line_count_sql}) AS line_count",
          "(#{state_count_sql('observed')}) AS observed_count",
          "(#{state_count_sql('skipped')}) AS skipped_count",
          "(#{reconciled_count_sql}) AS reconciled_count"
        )
      end
      private_class_method :with_metrics

      def self.line_count_sql
        <<~SQL.squish
          SELECT COUNT(*) FROM clinic_inventory_count_session_lines line
          WHERE line.practice_id=clinic_inventory_count_sessions.practice_id
            AND line.count_session_id=clinic_inventory_count_sessions.id
        SQL
      end
      private_class_method :line_count_sql

      def self.state_count_sql(kind)
        <<~SQL.squish
          SELECT COUNT(*) FROM clinic_inventory_count_session_lines line
          WHERE line.practice_id=clinic_inventory_count_sessions.practice_id
            AND line.count_session_id=clinic_inventory_count_sessions.id
            AND (#{latest_line_event_kind_sql})=#{CountSession.connection.quote(kind)}
        SQL
      end
      private_class_method :state_count_sql

      def self.reconciled_count_sql
        <<~SQL.squish
          SELECT COUNT(*)
          FROM clinic_inventory_count_session_lines line
          JOIN clinic_pharmacy_batches batch
            ON batch.practice_id=line.practice_id AND batch.id=line.batch_id
          WHERE line.practice_id=clinic_inventory_count_sessions.practice_id
            AND line.count_session_id=clinic_inventory_count_sessions.id
            AND (#{latest_line_event_kind_sql})='observed'
            AND EXISTS (
                  SELECT 1
                  FROM clinic_inventory_counts observation
                  LEFT JOIN clinic_inventory_count_approvals approval
                    ON approval.practice_id=observation.practice_id AND approval.count_id=observation.id
                  WHERE observation.practice_id=line.practice_id
                    AND observation.count_session_line_id=line.id
                    AND observation.id=(
                      SELECT MAX(latest_observation.id) FROM clinic_inventory_counts latest_observation
                      WHERE latest_observation.practice_id=line.practice_id
                        AND latest_observation.count_session_line_id=line.id
                    )
                    AND observation.id=(#{latest_line_event_count_sql})
                    AND (
                      (
                        observation.observed_quantity=observation.expected_quantity
                        AND batch.on_hand=observation.observed_quantity
                        AND (#{latest_batch_entry_sql}) IS NOT DISTINCT FROM observation.cutoff_entry_id
                      )
                      OR (
                        observation.observed_quantity<>observation.expected_quantity
                        AND approval.entry_id IS NOT NULL
                        AND batch.on_hand=observation.observed_quantity
                        AND (#{latest_batch_entry_sql})=approval.entry_id
                      )
                    )
                )
        SQL
      end
      private_class_method :reconciled_count_sql

      def self.latest_line_event_kind_sql
        <<~SQL.squish
          SELECT event.kind FROM clinic_inventory_count_session_events event
          WHERE event.practice_id=line.practice_id AND event.count_session_line_id=line.id
            AND event.kind IN ('observed','skipped','resumed')
          ORDER BY event.id DESC LIMIT 1
        SQL
      end
      private_class_method :latest_line_event_kind_sql

      def self.latest_line_event_count_sql
        <<~SQL.squish
          SELECT event.count_id FROM clinic_inventory_count_session_events event
          WHERE event.practice_id=line.practice_id AND event.count_session_line_id=line.id
            AND event.kind IN ('observed','skipped','resumed')
          ORDER BY event.id DESC LIMIT 1
        SQL
      end
      private_class_method :latest_line_event_count_sql

      def self.latest_batch_entry_sql
        <<~SQL.squish
          SELECT MAX(entry.id) FROM clinic_inventory_entries entry
          WHERE entry.practice_id=batch.practice_id AND entry.batch_id=batch.id
        SQL
      end
      private_class_method :latest_batch_entry_sql

      def self.latest_observations(practice_id, line_ids)
        Count.where(practice_id: practice_id, count_session_line_id: line_ids)
          .select("DISTINCT ON (count_session_line_id) clinic_inventory_counts.*")
          .order(:count_session_line_id, id: :desc).includes(:approval)
          .index_by(&:count_session_line_id)
      end
      private_class_method :latest_observations

      def self.latest_line_events(practice_id, line_ids)
        CountSessionEvent.where(practice_id: practice_id, count_session_line_id: line_ids,
          kind: %w[observed skipped resumed])
          .select("DISTINCT ON (count_session_line_id) clinic_inventory_count_session_events.*")
          .order(:count_session_line_id, id: :desc).includes(:count)
          .index_by(&:count_session_line_id)
      end
      private_class_method :latest_line_events

      def self.normalized_query(value)
        query = value.to_s.strip
        raise ArgumentError, "Count-session search must be 100 characters or fewer." if query.length > 100

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
