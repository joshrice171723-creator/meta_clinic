module Clinic
  module Inventory
    class PostReceivingSession
      # A packing slip groups the existing one-line delivery records. The entire
      # session commits together; historical shipment/receipt invariants remain.
      def self.call(practice:, actor:, order_id:, input:)
        rows = input.fetch(:lines)
        raise ArgumentError, "Select 1–100 delivery lines." unless rows.is_a?(Array) && rows.size.between?(1, 100)
        key = input.fetch(:request_key)
        digest = Digest::SHA256.hexdigest(JSON.generate([actor.id, order_id.to_s, input.deep_stringify_keys]))
        Access.with(practice.id, actor, "receive") do
          Access.retry_lock(practice.id, key)
          order = PurchaseOrder.where(practice_id: practice.id).lock.find(order_id)
          previous = ReceivingSession.find_by(practice_id: practice.id, request_key: key)
          if previous
            raise ArgumentError, "This session was already used for different data." unless previous.payload_digest == digest
            return previous
          end
          raise ArgumentError, "Receive only sent or partially received orders." unless %w[sent partially_received].include?(order.status)
          session = ReceivingSession.new(practice: practice, actor: actor, purchase_order: order,
            reference: input.fetch(:reference).to_s.strip, reason: input.fetch(:reason).to_s.strip,
            request_key: key, payload_digest: digest)
          session.validate!
          product_ids = order.lines.where(id: rows.map { |row| row[:purchase_order_line_id] }).pluck(:product_id)
          PharmacyProduct.where(practice_id: practice.id, id: product_ids).order(:id).lock.load
          Location.where(practice_id: practice.id, id: rows.map { |row| row[:destination_location_id] }).order(:id).lock.load
          outcomes = rows.each_with_index.map do |values, index|
            row = values.with_indifferent_access
            line = order.lines.where(practice_id: practice.id).lock.find(row.fetch(:purchase_order_line_id))
            delivered = Quantity.parse(row.fetch(:delivered_packages), scale: 0)
            accepted = Quantity.parse(row.fetch(:accepted_packages), scale: 0, zero: true)
            open = ShipmentLine.where(practice_id: practice.id, purchase_order_line_id: line.id)
              .where.not(shipment_id: Receipt.where(practice_id: practice.id).where.not(shipment_id: nil).select(:shipment_id))
              .where.not(shipment_id: ShipmentReconciliation.where(practice_id: practice.id).select(:shipment_id)).sum(:expected_packages)
            raise ArgumentError, "Delivery exceeds unallocated order packages." if delivered > line.remaining_quantity - open
            shipment_key = derived_key(key, "shipment", index)
            shipment = order.shipments.create!(practice: practice, actor: actor, reference: "#{session.reference.first(100)}-#{index + 1}",
              supplier_reference: session.reference, status: "delivered", package_count: delivered,
              expected_units: delivered * line.conversion_factor, delivered_at: Time.current,
              request_key: shipment_key, payload_digest: digest)
            shipment.shipment_lines.create!(practice: practice, purchase_order_line: line, expected_packages: delivered)
            product = line.product
            lot = Lot.find_by(practice_id: practice.id, product_id: product.id, number: row[:lot_number].to_s.strip)
            recall = if lot && accepted.positive?
              Recall.open_cases.where(practice_id: practice.id, product_id: product.id).joins(:recall_lots)
                .where(clinic_inventory_recall_lots: { lot_id: lot.id }).order(:id).first
            end
            result = Receiving.call(practice: practice, actor: actor, purchase_order: order, shipment: shipment,
              supplier: order.supplier&.name, invoice_reference: input[:invoice_reference], reason: session.reason,
              request_key: derived_key(key, "receipt", index), recall: recall, status: recall ? "quarantined" : "received",
              reconciliation: row[:reconciliation]&.to_h,
              lines: [{ product_id: product.id, purchase_order_line_id: line.id, amount: accepted.to_s("F"),
                input_unit: "package", lot_number: row[:lot_number], expires_on: row[:expiration_date],
                location_id: row[:destination_location_id], temperature_c: row[:temperature_c],
                unit_cost: line.unit_price.to_s("F"), currency: line.currency }])
            { shipment_id: shipment.id.to_s, receipt_id: result.is_a?(Receipt) ? result.id.to_s : nil,
              purchase_order_line_id: line.id.to_s, accepted_packages: accepted.to_s("F") }
          end
          session.details = { lines: outcomes }
          session.save!
          session
        end
      end

      def self.derived_key(key, kind, index)
        hex = Digest::SHA256.hexdigest("#{key}:#{kind}:#{index}").first(32)
        [hex[0, 8], hex[8, 4], hex[12, 4], hex[16, 4], hex[20, 12]].join("-")
      end
      private_class_method :derived_key
    end
  end
end
