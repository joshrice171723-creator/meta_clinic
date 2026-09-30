module Clinic
  module Care
    # Commercial units only. Recording use does not create a clinical delivery,
    # invoice, payment, inventory movement, or recurring-period allowance.
    class SubscriptionEntitlements
      def self.record(agreement:, actor:, kind:, service_id: nil, quantity: nil, reversed_entry_id: nil, source_reference:, request_key:)
        Authorization.authorize_with_legacy!(practice: agreement.practice, actor: actor,
          action: "billing.payment_record", legacy_action: "billing.write")
        raise ArgumentError, "Unsupported entitlement action." unless %w[opening use reversal].include?(kind)
        if kind == "reversal"
          raise ArgumentError, "Reversal units and service come from the original use." if service_id || quantity
        elsif reversed_entry_id
          raise ArgumentError, "Only reversals may reference an earlier use."
        end

        key = SubscriptionDefinition.request_key(request_key)
        reference = SubscriptionDefinition.text(source_reference, 160, required: true)
        ApplicationRecord.transaction do
          agreement.practice.lock!
          agreement.patient.lock!
          agreement.lock!
          entries = records(agreement).order(:id).to_a
          original = if kind == "reversal"
            id = SubscriptionDefinition.integer(reversed_entry_id, 1..9_223_372_036_854_775_807, "Use entry ID")
            entries.find { |entry| entry.id == id && entry.kind == "use" } || raise(ActiveRecord::RecordNotFound)
          end
          service = original ? original.service_id : SubscriptionDefinition.integer(service_id, 1..9_223_372_036_854_775_807, "Service ID")
          units = original ? original.quantity : SubscriptionDefinition.integer(quantity, (kind == "opening" ? 0 : 1)..10000, "Service quantity")
          attributes = { kind: kind, service_id: service, quantity: units,
            reversed_entry_id: original&.id, source_reference: reference }
          existing = entries.find { |entry| entry.request_key == key }
          if existing
            raise ArgumentError, "Request key was used for different entitlement evidence." unless
              attributes.all? { |field, value| existing.public_send(field) == value }
            next existing
          end

          component = components(agreement).find { |item| item.fetch("service_id") == service }
          raise ArgumentError, "This service was not purchased in the package." unless component
          raise ArgumentError, "Only fixed-term, term-frequency package units are supported." unless
            agreement.snapshot.fetch("renewal") != "automatic" && component.fetch("frequency") == "term"
          balance = project(agreement: agreement, entries: entries).find { |item| item[:service_id] == service }
          case kind
          when "opening"
            raise ArgumentError, "An opening balance is already recorded for this service." unless balance[:remaining_quantity].nil?
            raise ArgumentError, "Only a paid active package can open an entitlement balance." unless agreement.current_state == "active"
            raise ArgumentError, "Opening balance exceeds the purchased quantity." if units > component.fetch("quantity")
          when "use"
            raise ArgumentError, "Only a paid active package can record service use." unless agreement.current_state == "active"
            raise ArgumentError, "Record the reviewed opening balance before recording service use." if balance[:remaining_quantity].nil?
            raise ArgumentError, "Service use exceeds the remaining package quantity." if units > balance[:remaining_quantity]
          when "reversal"
            raise ArgumentError, "This service use has already been reversed." if entries.any? { |entry| entry.reversed_entry_id == original.id }
          end
          entry = records(agreement).create!(attributes.merge(actor: actor, request_key: key))
          AuditRecorder.record!(practice: agreement.practice, actor: actor,
            action_code: "subscriptions.entitlement_#{kind}", outcome: :committed,
            resource_version_ref: "subscription_entitlement_entry:#{entry.id}")
          entry
        end
      end

      def self.records(agreement)
        SubscriptionEntitlementEntry.where(practice_id: agreement.practice_id, agreement_id: agreement.id)
      end

      def self.components(agreement)
        agreement.snapshot.fetch("selected_components", [])
      end

      def self.project(agreement:, entries:, state: agreement.current_state)
        by_service = entries.group_by(&:service_id)
        components(agreement).map do |component|
          rows = by_service.fetch(component.fetch("service_id"), [])
          opening = rows.find { |entry| entry.kind == "opening" }
          used = rows.select { |entry| entry.kind == "use" }.sum(&:quantity)
          restored = rows.select { |entry| entry.kind == "reversal" }.sum(&:quantity)
          supported = agreement.snapshot.fetch("renewal") != "automatic" && component.fetch("frequency") == "term"
          remaining = supported && opening ? opening.quantity - used + restored : nil
          status = if !supported
            "unsupported_frequency"
          elsif opening.nil?
            "not_recorded"
          elsif state != "active"
            "inactive"
          elsif remaining.zero?
            "exhausted"
          else
            "available"
          end
          { service_id: component.fetch("service_id"), name: component.fetch("name"),
            frequency: component.fetch("frequency"), purchased_quantity: component.fetch("quantity"),
            opening_quantity: opening&.quantity, used_quantity: used, reversed_quantity: restored,
            remaining_quantity: remaining, status: status, can_use: status == "available",
            source: "staff_recorded_package_ledger" }
        end
      end
    end
  end
end
