module Clinic
  module Inventory
    class PrepareOrderDelivery
      KEY = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/

      # A local evidence snapshot only. There is deliberately no transport or sending hook.
      def self.call(practice:, actor:, order_id:, input:)
        input = input.to_h.with_indifferent_access
        key = input.fetch(:request_key).to_s.downcase
        raise ArgumentError, "A valid preparation retry key is required." unless key.match?(KEY)
        version = Integer(input.fetch(:order_version).to_s, 10)
        digest = input.fetch(:source_digest).to_s
        reason = input.fetch(:reason).to_s.strip
        raise ArgumentError, "Record a preparation reason (1–200 characters)." unless reason.length.between?(1, 200)
        intent = Digest::SHA256.hexdigest(JSON.generate([ actor.id, order_id.to_s, version, digest, reason ]))
        Access.with_authorization(practice.id, actor, "catalog", "procurement.submit") do
          Access.retry_lock(practice.id, key)
          order = PurchaseOrder.where(practice_id: practice.id).lock.find(order_id)
          existing = DeliveryPreparation.where(practice_id: practice.id, request_key: key).first
          if existing
            raise Clinic::Idempotency::Conflict unless existing.intent_digest == intent
            next existing
          end
          raise ArgumentError, "Only an approved purchase order can be prepared for supplier delivery." unless order.status == "approved" && order.supplier_id.present? && order.lines.exists?
          raise ArgumentError, "This order version already has a preparation. Reconcile the saved attempt." if
            DeliveryPreparation.where(practice_id: practice.id, purchase_order_id: order.id, order_version: order.version).exists?
          snapshot = snapshot(order)
          raise ArgumentError, "The prepared source changed. Reload and review the order before preparing it." unless
            order.version == version && source_digest(snapshot) == digest
          record = DeliveryPreparation.create!(practice: practice, purchase_order: order, actor: actor,
            order_version: version, request_key: key, intent_digest: intent, source_digest: digest,
            attempt_id: SecureRandom.uuid, correlation_id: SecureRandom.uuid, reason: reason,
            snapshot: snapshot, prepared_at: Time.current)
          Clinic::AuditRecorder.record!(practice: practice, actor: actor,
            action_code: "inventory.purchase_order.prepare_delivery", outcome: :committed,
            resource_version_ref: "inventory_delivery_preparation:#{record.id}")
          record
        end
      end

      def self.source_digest(snapshot)
        Digest::SHA256.hexdigest(JSON.generate(snapshot))
      end

      def self.snapshot(order)
        { purchase_order_id: order.id.to_s, number: order.number, version: order.version,
          status: order.status, supplier_id: order.supplier_id&.to_s, supplier: order.supplier&.name,
          destination: order.destination, destination_address: order.destination_address,
          subtotal: order.subtotal.to_d.to_s("F"), tax: order.tax.to_d.to_s("F"),
          shipping: order.shipping.to_d.to_s("F"), total: order.total.to_d.to_s("F"),
          lines: order.lines.order(:id).map { |line| { id: line.id.to_s, product_id: line.product_id.to_s,
            product_name: line.product_name, supplier_sku: line.supplier_sku,
            quantity: line.ordered_quantity.to_d.to_s("F"), units_per_package: line.conversion_factor.to_d.to_s("F"),
            stock_unit: line.stock_unit, package_price: line.unit_price.to_d.to_s("F"), currency: line.currency,
            quote_reference: line.quote_reference, quoted_on: line.quoted_on&.iso8601,
            quoted_fee_amount: line.quoted_fee_amount&.to_d&.to_s("F"),
            quoted_fee_currency: line.quoted_fee_currency, quoted_fee_basis: line.quoted_fee_basis } } }
      end
    end
  end
end
