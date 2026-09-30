module Clinic
  module Care
    # Resolves evidence, never benefits: only configured purchased allowances
    # can consume a deliberately selected paid period. Original usage stays put.
    class SubscriptionPaidPeriods
      def self.records(agreement)
        SubscriptionPaidPeriodResolution.where(practice_id: agreement.practice_id, agreement_id: agreement.id)
      end

      def self.events(agreement)
        agreement.events.to_a.select { |event| event.kind == "active" }.map do |event|
          { id: event.id, starts_at: Time.iso8601(event.details.fetch("starts_at")).utc.iso8601(6),
            ends_at: Time.iso8601(event.details.fetch("ends_at")).utc.iso8601(6),
            recorded_at: event.created_at.utc.iso8601(6), details: event.details.deep_dup }
        end.sort_by { |event| event[:id] }
      end

      def self.evidence(agreement:, component:, at: Current.business_time)
        return nil unless component["allowance"] && SubscriptionDefinition.allowance(component["allowance"])
        all = events(agreement)
        paid = all.select { |event| Time.iso8601(event[:starts_at]) <= at && at < Time.iso8601(event[:ends_at]) }
        return nil unless paid.length > 1
        boundaries = all.flat_map { |event| [Time.iso8601(event[:starts_at]), Time.iso8601(event[:ends_at])] }
        start = boundaries.select { |time| time <= at }.max
        finish = boundaries.select { |time| time > at }.min
        snapshot = { service_id: component.fetch("service_id"), overlap_start: start.iso8601(6),
          overlap_end: finish.iso8601(6), events: paid }
        { candidates: paid, overlap_start: start, overlap_end: finish,
          evidence_token: SubscriptionDefinition.fingerprint(snapshot.deep_stringify_keys), evidence_snapshot: { events: paid } }
      end

      def self.current_resolution(agreement:, component:, evidence:, at: Current.business_time)
        return nil unless evidence
        records(agreement).find_by(service_id: component.fetch("service_id"), evidence_token: evidence[:evidence_token])&.then do |resolution|
          resolution if resolution.effective_at <= at
        end
      end

      def self.conflicting_uses(agreement:, service_id:, window:, entries: nil)
        entries ||= SubscriptionAllowances.records(agreement).order(:id).to_a
        reversed = entries.filter_map(&:reversed_entry_id)
        entries.select do |row|
          row.service_id == service_id && row.kind == "use" && !reversed.include?(row.id) &&
            row.paid_event_id != window[:paid_event_id] && row.window_start < window[:window_end] &&
            window[:window_start] < row.window_end
        end
      end

      def self.cases(agreement:, at: Current.business_time)
        rows = SubscriptionAllowances.records(agreement).order(:id).to_a
        SubscriptionEntitlements.components(agreement).filter_map do |component|
          evidence = evidence(agreement: agreement, component: component, at: at)
          next unless evidence
          resolution = current_resolution(agreement: agreement, component: component, evidence: evidence, at: at)
          blockers = evidence[:candidates].filter_map do |event|
            window = SubscriptionAllowances.event_window(event, component, at: at)
            conflicts = conflicting_uses(agreement: agreement, service_id: component.fetch("service_id"), window: window, entries: rows)
            { selected_paid_event_id: event[:id], entry_ids: conflicts.map(&:id) } if conflicts.any?
          end
          { service_id: component.fetch("service_id"), name: component.fetch("name"),
            status: resolution ? "resolved" : "unresolved", evidence_token: evidence[:evidence_token],
            overlap_start: evidence[:overlap_start].iso8601(6), overlap_end: evidence[:overlap_end].iso8601(6),
            candidates: evidence[:candidates], resolution: resolution && serialize(resolution), blockers: blockers }
        end
      end

      def self.record(agreement:, actor:, service_id:, selected_paid_event_id:, evidence_token:, reason:, request_key:)
        Authorization.authorize_with_legacy!(practice: agreement.practice, actor: actor,
          action: "billing.payment_record", legacy_action: "billing.write")
        service = SubscriptionDefinition.integer(service_id, 1..9_223_372_036_854_775_807, "Service ID")
        selected = SubscriptionDefinition.integer(selected_paid_event_id, 1..9_223_372_036_854_775_807, "Paid event ID")
        key = SubscriptionDefinition.request_key(request_key)
        reason = SubscriptionDefinition.text(reason, 1000, required: true)
        token = SubscriptionDefinition.text(evidence_token, 64, required: true)
        raise ArgumentError, "Invalid paid-period evidence token." unless token.match?(/\A[0-9a-f]{64}\z/)
        ApplicationRecord.transaction do
          agreement.practice.lock!
          agreement.patient.lock!
          agreement.lock!
          existing = records(agreement).find_by(request_key: key)
          if existing
            raise ArgumentError, "Request key was used for different resolution evidence." unless
              existing.service_id == service && existing.selected_paid_event_id == selected &&
                existing.evidence_token == token && existing.reason == reason
            next existing
          end
          component = SubscriptionEntitlements.components(agreement).find { |item| item.fetch("service_id") == service }
          raise ArgumentError, "Purchased allowance policy is unconfigured." unless component && component["allowance"]
          at = Current.business_time
          evidence = evidence(agreement: agreement, component: component, at: at)
          raise ArgumentError, "Competing paid periods changed or ended. Refresh before selecting evidence." unless
            evidence && evidence[:evidence_token] == token
          event = evidence[:candidates].find { |item| item[:id] == selected }
          raise ArgumentError, "Select one of the displayed competing paid events." unless event
          raise ArgumentError, "This paid-period evidence already has an immutable resolution." if
            records(agreement).exists?(service_id: service, evidence_token: token)
          window = SubscriptionAllowances.event_window(event, component, at: at)
          conflicts = conflicting_uses(agreement: agreement, service_id: service, window: window)
          raise ArgumentError, "Other paid-period windows retain unreversed use. Review and explicitly reverse original use before selecting this event." if conflicts.any?
          resolution = records(agreement).create!(service_id: service, selected_paid_event_id: selected,
            candidate_event_ids: evidence[:candidates].map { |item| item[:id] }, evidence_snapshot: evidence[:evidence_snapshot],
            evidence_token: token, overlap_start: evidence[:overlap_start], overlap_end: evidence[:overlap_end],
            effective_at: at, reason: reason, actor: actor, request_key: key)
          AuditRecorder.record!(practice: agreement.practice, actor: actor,
            action_code: "subscriptions.paid_period.resolve", outcome: :committed,
            resource_version_ref: "subscription_paid_period_resolution:#{resolution.id}")
          resolution
        end
      end

      def self.serialize(resolution)
        { id: resolution.id, service_id: resolution.service_id, selected_paid_event_id: resolution.selected_paid_event_id,
          candidate_event_ids: resolution.candidate_event_ids, evidence_token: resolution.evidence_token,
          evidence_snapshot: resolution.evidence_snapshot, overlap_start: resolution.overlap_start.iso8601(6),
          overlap_end: resolution.overlap_end.iso8601(6), effective_at: resolution.effective_at.iso8601(6),
          reason: resolution.reason, actor_id: resolution.actor_id, created_at: resolution.created_at.iso8601(6),
          request_key: resolution.request_key }
      end
    end
  end
end
