module Clinic
  module Inventory
    class CountProgram
      def self.create!(practice:, actor:, location_id:, assignee_id:, due_on:, blind:, reason:, request_key:)
        request_key = request_key!(request_key)
        location_id = positive_id!(location_id, "inventory bin")
        assignee_id = positive_id!(assignee_id, "assignee")
        due_on = Date.iso8601(due_on.to_s)
        raise ArgumentError, "Choose whether this count is blind." unless [ true, false ].include?(blind)
        reason = required_text!(reason, "count-program reason")
        payload = { actor_id: actor.id, location_id: location_id, assignee_id: assignee_id,
          due_on: due_on.iso8601, blind: blind, reason: reason }
        digest = digest(payload)

        CountSession.transaction do
          practice = Clinic::Practice.lock.find(practice.id)
          Access.with(practice.id, actor, "configure") do
            Access.retry_lock(practice.id, request_key)
            existing = CountSession.find_by(practice_id: practice.id, request_key: request_key)
            if existing
              assert_replay!(existing, actor.id, digest, "count-program")
              return existing
            end

            validate_assignee!(practice, assignee_id)
            positions = PharmacyBatch.where(practice_id: practice.id, location_id: location_id).order(:id).limit(501).to_a
            raise ArgumentError, "This inventory bin has no recorded stock positions to count." if positions.empty?
            raise ArgumentError, "This inventory bin has more than 500 positions. Split it before starting a count session." if positions.size > 500
            PharmacyProduct.where(practice_id: practice.id, id: positions.map(&:product_id).uniq).order(:id).lock.load
            location = Location.where(practice_id: practice.id).includes(:site, :children).lock.find(location_id)
            location.ensure_stock_destination!
            raise ArgumentError, "This inventory bin already has an open count session." if CountSession.exists?(practice_id: practice.id, location_id: location.id, status: "open")
            positions = PharmacyBatch.where(practice_id: practice.id, id: positions.map(&:id)).order(:id).lock.to_a

            session = CountSession.create!(practice: practice, location: location, actor: actor, assignee_id: assignee_id,
              due_on: due_on, blind: blind, status: "open", reason: reason, request_key: request_key, payload_digest: digest)
            positions.each { |batch| session.lines.create!(practice: practice, batch: batch) }
            session
          end
        end
      rescue Date::Error
        raise ArgumentError, "Choose a valid due date."
      end

      def self.observe!(line:, actor:, observed:, reason:, request_key:)
        request_key = request_key!(request_key)
        reason = required_text!(reason, "count reason")
        Count.transaction do
          line = CountSessionLine.where(practice_id: line.practice_id).find(line.id)
          count = Count.observe!(batch: line.batch, actor: actor, observed: observed, reason: reason,
            request_key: request_key, session_line: line)
          record_event!(session: line.count_session, line: line, count: count, actor: actor,
            kind: "observed", reason: reason, request_key: request_key)
          count
        end
      end

      def self.skip!(line:, actor:, reason:, request_key:)
        line_event!(line: line, actor: actor, kind: "skipped", reason: reason, request_key: request_key)
      end

      def self.resume!(line:, actor:, reason:, request_key:)
        line_event!(line: line, actor: actor, kind: "resumed", reason: reason, request_key: request_key) do |locked_line|
          latest = locked_line.events.order(id: :desc).first
          raise ArgumentError, "Only a skipped count line can be resumed." unless latest&.kind == "skipped"
        end
      end

      def self.reassign!(session:, actor:, assignee_id:, reason:, request_key:)
        assignee_id = positive_id!(assignee_id, "assignee")
        session_event!(session: session, actor: actor, kind: "reassigned", reason: reason,
          request_key: request_key, assignee_id: assignee_id) do |locked_session|
          validate_assignee!(locked_session.practice, assignee_id)
          raise ArgumentError, "This person is already assigned to the count session." if locked_session.assignee_id == assignee_id
        end
      end

      def self.complete!(session:, actor:, reason:, request_key:)
        session_event!(session: session, actor: actor, kind: "completed", reason: reason, request_key: request_key) do |locked_session|
          assert_ready!(locked_session)
        end
      end

      def self.cancel!(session:, actor:, reason:, request_key:)
        session_event!(session: session, actor: actor, kind: "cancelled", reason: reason, request_key: request_key)
      end

      def self.line_event!(line:, actor:, kind:, reason:, request_key:)
        request_key = request_key!(request_key)
        reason = required_text!(reason, "count-session reason")
        CountSession.transaction do
          Access.with(line.practice_id, actor, "configure") do
            Access.retry_lock(line.practice_id, request_key)
            session = CountSession.where(practice_id: line.practice_id).lock.find(line.count_session_id)
            existing = CountSessionEvent.find_by(practice_id: line.practice_id, request_key: request_key)
            return replay_event!(existing, actor, event_digest(session: session, line: line, actor: actor, kind: kind, reason: reason)) if existing
            raise ArgumentError, "This count session is no longer open." unless session.status == "open"
            line = CountSessionLine.where(practice_id: session.practice_id, count_session_id: session.id).find(line.id)
            yield line if block_given?
            record_event!(session: session, line: line, actor: actor, kind: kind, reason: reason, request_key: request_key)
          end
        end
      end
      private_class_method :line_event!

      def self.session_event!(session:, actor:, kind:, reason:, request_key:, assignee_id: nil)
        request_key = request_key!(request_key)
        reason = required_text!(reason, "count-session reason")
        CountSession.transaction do
          Access.with(session.practice_id, actor, "configure") do
            Access.retry_lock(session.practice_id, request_key)
            session = CountSession.where(practice_id: session.practice_id).lock.find(session.id)
            attributes = { session: session, actor: actor, kind: kind, reason: reason, assignee_id: assignee_id }
            existing = CountSessionEvent.find_by(practice_id: session.practice_id, request_key: request_key)
            return replay_event!(existing, actor, event_digest(**attributes)) if existing
            raise ArgumentError, "This count session is no longer open." unless session.status == "open"
            yield session if block_given?
            event = record_event!(**attributes, request_key: request_key)
            session.update!(assignee_id: assignee_id) if kind == "reassigned"
            session.update!(status: kind) if %w[completed cancelled].include?(kind)
            event
          end
        end
      end
      private_class_method :session_event!

      def self.assert_ready!(session)
        lines = session.lines.includes(:batch).order(:id).to_a
        line_ids = lines.map(&:id)
        latest_events = CountSessionEvent.where(practice_id: session.practice_id, count_session_line_id: line_ids,
          kind: %w[observed skipped resumed]).select("DISTINCT ON (count_session_line_id) clinic_inventory_count_session_events.*")
          .order(:count_session_line_id, id: :desc).index_by(&:count_session_line_id)
        latest_counts = Count.where(practice_id: session.practice_id, count_session_line_id: line_ids)
          .select("DISTINCT ON (count_session_line_id) clinic_inventory_counts.*")
          .order(:count_session_line_id, id: :desc).includes(:approval).index_by(&:count_session_line_id)
        products = PharmacyProduct.where(practice_id: session.practice_id, id: lines.map { |line| line.batch.product_id }.uniq).order(:id).lock.to_a
        batches = PharmacyBatch.where(practice_id: session.practice_id, id: lines.map(&:batch_id)).order(:id).lock.index_by(&:id)
        cutoffs = PharmacyMovement.where(practice_id: session.practice_id, batch_id: batches.keys).group(:batch_id).maximum(:id)
        product_ids = products.map(&:id)
        raise ArgumentError, "Count-session stock scope changed. Reload and try again." unless product_ids.sort == lines.map { |line| line.batch.product_id }.uniq.sort

        incomplete = lines.any? do |line|
          latest_event = latest_events[line.id]
          next false if latest_event&.kind == "skipped"

          latest_count = latest_counts[line.id]
          latest_event&.kind != "observed" || latest_event.count_id != latest_count&.id ||
            !reconciled?(latest_count, batches.fetch(line.batch_id), cutoffs[line.batch_id])
        end
        raise ArgumentError, "Count or explicitly skip every line, and recount any stale or resumed line, before completion." if incomplete
      end
      private_class_method :assert_ready!

      def self.reconciled?(count, batch, latest_entry_id)
        if count.expected_quantity == count.observed_quantity
          count.cutoff_entry_id == latest_entry_id && batch.quantity == count.observed_quantity
        else
          approval = count.approval
          approval&.entry_id.present? && approval.entry_id == latest_entry_id && batch.quantity == count.observed_quantity
        end
      end
      private_class_method :reconciled?

      def self.record_event!(session:, actor:, kind:, reason:, request_key:, line: nil, count: nil, assignee_id: nil)
        digest = event_digest(session: session, line: line, count: count, actor: actor,
          kind: kind, reason: reason, assignee_id: assignee_id)
        existing = CountSessionEvent.find_by(practice_id: session.practice_id, request_key: request_key)
        return replay_event!(existing, actor, digest) if existing

        CountSessionEvent.create!(practice: session.practice, count_session: session, count_session_line: line,
          count: count, actor: actor, assignee_id: assignee_id, kind: kind, reason: reason,
          request_key: request_key, payload_digest: digest)
      end
      private_class_method :record_event!

      def self.event_digest(session:, actor:, kind:, reason:, line: nil, count: nil, assignee_id: nil)
        digest(count_session_id: session.id, count_session_line_id: line&.id, count_id: count&.id,
          actor_id: actor.id, assignee_id: assignee_id, kind: kind, reason: reason)
      end
      private_class_method :event_digest

      def self.replay_event!(event, actor, expected_digest)
        unless event.actor_id == actor.id && event.payload_digest == expected_digest
          raise ArgumentError, "This count-session request key was already used for different data."
        end
        event
      end
      private_class_method :replay_event!

      def self.assert_replay!(record, actor_id, expected_digest, label)
        return if record.actor_id == actor_id && record.payload_digest == expected_digest

        raise ArgumentError, "This #{label} request key was already used for different data."
      end
      private_class_method :assert_replay!

      def self.validate_assignee!(practice, assignee_id)
        assignee = User.joins(:clinic_membership).where(id: assignee_id, active: true,
          clinic_memberships: { practice_id: practice.id, active: true }).first
        begin
          Clinic::Authorization.authorize!(actor: assignee, practice: practice, action: "inventory.count") if assignee
        rescue Clinic::Authorization::Denied
          assignee = nil
        end
        raise ArgumentError, "Choose an active clinic member with inventory count access." unless assignee
      end
      private_class_method :validate_assignee!

      def self.digest(payload)
        Digest::SHA256.hexdigest(JSON.generate(payload.sort.to_h))
      end
      private_class_method :digest

      def self.positive_id!(value, label)
        text = value.to_s
        unless /\A[1-9][0-9]*\z/.match?(text) && text.to_i <= 9_223_372_036_854_775_807
          raise ArgumentError, "Choose a valid #{label}."
        end
        text.to_i
      end
      private_class_method :positive_id!

      def self.request_key!(value)
        key = value.to_s
        unless /\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/.match?(key)
          raise ArgumentError, "Reload the form to obtain a valid retry key."
        end
        key
      end
      private_class_method :request_key!

      def self.required_text!(value, label)
        text = value.to_s.strip
        raise ArgumentError, "Provide a #{label} of 200 characters or fewer." unless text.length.between?(1, 200)
        text
      end
      private_class_method :required_text!
    end
  end
end
