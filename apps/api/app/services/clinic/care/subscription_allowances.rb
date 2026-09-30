module Clinic
  module Care
    # Commercial allowance windows from immutable purchased terms and paid events.
    # Reads do not write grants. Reversals stay in the original window forever.
    class SubscriptionAllowances
      def self.records(agreement)
        SubscriptionAllowanceEntry.where(practice_id: agreement.practice_id, agreement_id: agreement.id)
      end

      def self.window(agreement, component, at: Current.business_time, check_conflicts: true)
        return nil unless component["allowance"] && SubscriptionDefinition.allowance(component["allowance"])
        at = at.utc
        paid = agreement.events.to_a.select do |event|
          next false unless event.kind == "active"
          Time.iso8601(event.details.fetch("starts_at")) <= at && at < Time.iso8601(event.details.fetch("ends_at"))
        end
        resolution = nil
        if paid.length > 1
          evidence = SubscriptionPaidPeriods.evidence(agreement: agreement, component: component, at: at)
          resolution = SubscriptionPaidPeriods.current_resolution(agreement: agreement, component: component, evidence: evidence, at: at)
          return nil unless resolution
          event = paid.find { |item| item.id == resolution.selected_paid_event_id }
        else
          return nil unless paid.one?
          event = paid.first
        end
        current = event_window({ id: event.id, starts_at: event.details.fetch("starts_at"), ends_at: event.details.fetch("ends_at") }, component, at: at)
        current[:period_resolution_id] = resolution.id if resolution
        return nil if check_conflicts && SubscriptionPaidPeriods.conflicting_uses(agreement: agreement,
          service_id: component.fetch("service_id"), window: current).any?
        current
      end

      def self.event_window(event, component, at: Current.business_time)
        anchor = Time.iso8601(event.fetch(:starts_at)).utc
        finish = Time.iso8601(event.fetch(:ends_at)).utc
        frequency = component.fetch("frequency")
        index = case frequency
        when "term" then 0
        when "day" then ((at - anchor) / 86400).floor
        when "week" then ((at - anchor) / 604800).floor
        when "month"
          months = (at.year - anchor.year) * 12 + at.month - anchor.month
          months -= 1 if anchor.advance(months: months) > at
          months
        else raise ArgumentError, "Unsupported allowance frequency."
        end
        start = boundary(anchor, frequency, index)
        stop = frequency == "term" ? finish : [boundary(anchor, frequency, index + 1), finish].min
        { paid_event_id: event.fetch(:id), window_start: start, window_end: stop }
      end

      def self.boundary(anchor, frequency, index)
        case frequency
        when "term" then anchor
        when "day" then anchor + index * 86400
        when "week" then anchor + index * 604800
        when "month" then anchor.advance(months: index)
        end
      end

      def self.token(window)
        return nil unless window
        value = "#{window[:paid_event_id]}:#{window[:window_start].iso8601(6)}:#{window[:window_end].iso8601(6)}"
        window[:period_resolution_id] ? "#{value}:resolution:#{window[:period_resolution_id]}" : value
      end

      def self.project(agreement:, component:, entries:, state:, at: Current.business_time)
        current = window(agreement, component, at: at, check_conflicts: false)
        conflicting = current && SubscriptionPaidPeriods.conflicting_uses(agreement: agreement,
          service_id: component.fetch("service_id"), window: current, entries: entries).any?
        rows = current ? entries.select { |row| row.service_id == component.fetch("service_id") &&
          row.paid_event_id == current[:paid_event_id] && row.window_start == current[:window_start] && row.window_end == current[:window_end] } : []
        used = rows.select { |row| row.kind == "use" }.sum(&:quantity)
        restored = rows.select { |row| row.kind == "reversal" }.sum(&:quantity)
        remaining = current && !conflicting ? component.fetch("quantity") - used + restored : nil
        status = if !component["allowance"] then "allowance_unconfigured"
        elsif !current then "paid_period_unavailable"
        elsif conflicting then "historical_usage_conflict"
        elsif state != "active" then "inactive"
        elsif remaining.zero? then "exhausted"
        else "available"
        end
        { service_id: component.fetch("service_id"), name: component.fetch("name"),
          frequency: component.fetch("frequency"), purchased_quantity: component.fetch("quantity"),
          opening_quantity: current ? component.fetch("quantity") : nil,
          used_quantity: used, reversed_quantity: restored, remaining_quantity: remaining,
          status: status, can_use: status == "available", source: "retained_recurring_allowance",
          allowance_window: token(current), window_start: current&.fetch(:window_start)&.iso8601(6),
          window_end: current&.fetch(:window_end)&.iso8601(6), period_resolution_id: current&.dig(:period_resolution_id) }
      end

      def self.record(agreement:, actor:, kind:, service_id: nil, quantity: nil, reversed_entry_id: nil,
        source_reference:, request_key:, allowance_window:)
        Authorization.authorize_with_legacy!(practice: agreement.practice, actor: actor,
          action: "billing.payment_record", legacy_action: "billing.write")
        raise ArgumentError, "Recurring allowances support use and whole-use reversal." unless %w[use reversal].include?(kind)
        key = SubscriptionDefinition.request_key(request_key)
        reference = SubscriptionDefinition.text(source_reference, 160, required: true)
        requested_window = SubscriptionDefinition.text(allowance_window, 160, required: true)
        ApplicationRecord.transaction do
          agreement.practice.lock!
          agreement.patient.lock!
          agreement.lock!
          if SubscriptionEntitlements.records(agreement).exists?(request_key: key)
            raise ArgumentError, "Request key was already used in the fixed-term ledger."
          end
          rows = records(agreement).order(:id).to_a
          if kind == "reversal"
            raise ArgumentError, "Reversal units and service come from the original use." if service_id || quantity
            id = SubscriptionDefinition.integer(reversed_entry_id, 1..9_223_372_036_854_775_807, "Use entry ID")
            original = rows.find { |row| row.id == id && row.kind == "use" } || raise(ActiveRecord::RecordNotFound)
            service, units = original.service_id, original.quantity
          else
            raise ArgumentError, "Only reversals reference earlier use." if reversed_entry_id
            service = SubscriptionDefinition.integer(service_id, 1..9_223_372_036_854_775_807, "Service ID")
            units = SubscriptionDefinition.integer(quantity, 1..10000, "Service quantity")
          end
          attributes = { kind: kind, service_id: service, quantity: units,
            reversed_entry_id: original&.id, source_reference: reference }
          existing = rows.find { |row| row.request_key == key }
          if existing
            raise ArgumentError, "Request key was used for different allowance evidence." unless
              attributes.all? { |field, value| existing.public_send(field) == value } && token(existing.attributes.symbolize_keys) == requested_window
            next existing
          end
          component = SubscriptionEntitlements.components(agreement).find { |item| item.fetch("service_id") == service }
          raise ArgumentError, "Purchased allowance policy is unconfigured." unless component && component["allowance"]
          SubscriptionDefinition.allowance(component["allowance"])
          at = Current.business_time
          current = if original
            original.attributes.symbolize_keys.slice(:paid_event_id, :window_start, :window_end, :period_resolution_id)
          else
            window(agreement, component, at: at)
          end
          raise ArgumentError, "Allowance window changed or is unavailable; refresh before recording new use." unless current && token(current) == requested_window
          if kind == "use"
            raise ArgumentError, "Only paid active access can record use." unless agreement.current_state(at: at) == "active"
            balance = project(agreement: agreement, component: component, entries: rows, state: "active", at: at)
            raise ArgumentError, "Service use exceeds remaining allowance." if units > balance[:remaining_quantity]
          elsif rows.any? { |row| row.reversed_entry_id == original.id }
            raise ArgumentError, "This service use has already been reversed."
          end
          entry = records(agreement).create!(attributes.merge(current).merge(actor: actor, request_key: key, accounted_at: at))
          AuditRecorder.record!(practice: agreement.practice, actor: actor,
            action_code: "subscriptions.allowance_#{kind}", outcome: :committed,
            resource_version_ref: "subscription_allowance_entry:#{entry.id}")
          entry
        end
      end
    end
  end
end
