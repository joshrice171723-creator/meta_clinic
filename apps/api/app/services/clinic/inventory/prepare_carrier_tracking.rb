require "digest"

module Clinic
  module Inventory
    class PrepareCarrierTracking
      KEY = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/

      # Prepare a tracking lookup from existing immutable shipment identifiers.
      # No carrier mapping, transport, response or domain transition is implied.
      def self.call(practice:, actor:, shipment_id:, input:)
        input = input.to_h.with_indifferent_access
        key = input.fetch(:request_key).to_s.downcase
        raise ArgumentError, "A valid preparation retry key is required." unless key.match?(KEY)
        digest = input.fetch(:source_digest).to_s
        reason = input.fetch(:reason).to_s.strip
        raise ArgumentError, "Record a preparation reason (1–200 characters)." unless reason.length.between?(1, 200)
        intent = Digest::SHA256.hexdigest(JSON.generate([ actor.id, shipment_id.to_s, digest, reason ]))
        Access.with(practice.id, actor, "receive") do
          Access.retry_lock(practice.id, key)
          shipment = Shipment.where(practice_id: practice.id).lock.find(shipment_id)
          existing = CarrierPreparation.where(practice_id: practice.id, request_key: key).first
          if existing
            raise Clinic::Idempotency::Conflict unless existing.intent_digest == intent
            next existing
          end
          unless shipment.carrier.present? && shipment.tracking_number.present?
            raise ArgumentError, "A recorded carrier and tracking identifier are required for local preparation."
          end
          reviewed = snapshot(shipment)
          unless source_digest(reviewed) == digest
            raise ArgumentError, "The shipment source changed. Reload and review it before preparing tracking."
          end
          if CarrierPreparation.where(practice_id: practice.id, shipment_id: shipment.id, source_digest: digest).exists?
            raise Clinic::Idempotency::Conflict, "This shipment source already has a preparation. Reconcile the saved attempt."
          end
          record = CarrierPreparation.create!(practice:, shipment:, actor:,
            request_key: key, intent_digest: intent, source_digest: digest,
            attempt_id: SecureRandom.uuid, correlation_id: SecureRandom.uuid, reason:,
            snapshot: reviewed, prepared_at: Current.business_time)
          Clinic::AuditRecorder.record!(practice:, actor:,
            action_code: "inventory.shipment.prepare_carrier_tracking", outcome: :committed,
            resource_version_ref: "inventory_carrier_preparation:#{record.id}:#{digest}")
          record
        end
      end

      def self.source_digest(snapshot)
        Digest::SHA256.hexdigest(JSON.generate(snapshot))
      end

      def self.snapshot(shipment)
        { shipment_id: shipment.id.to_s, source_version: "shipment/#{shipment.id}:#{shipment.created_at.iso8601(6)}",
          purchase_order_id: shipment.purchase_order_id.to_s,
          reference: shipment.reference, supplier_reference: shipment.supplier_reference,
          carrier: shipment.carrier, tracking_number: shipment.tracking_number,
          package_count: shipment.package_count.to_d.to_s("F"),
          expected_units: shipment.expected_units.to_d.to_s("F"),
          recorded_at: shipment.created_at.iso8601(6), source: "manual_shipment_record",
          operation: "tracking_lookup" }
      end
    end
  end
end
