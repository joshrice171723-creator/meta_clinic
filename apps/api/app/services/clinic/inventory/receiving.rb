module Clinic
  module Inventory
    class Receiving
      # One request is a delivery with one or more lot allocations. Costs are per
      # input unit, unknown remains null; this does not order goods or bill fees.
      def self.call(practice:, actor:, lines:, reason:, request_key:, supplier: nil, invoice_reference: nil)
        raise ArgumentError, "A receipt needs 1–100 lines." unless lines.is_a?(Array) && lines.size.between?(1, 100)
        normalized = lines.map { |line| line.symbolize_keys.slice(:product_id, :lot_number, :location, :expires_on, :amount, :input_unit, :unit_cost, :currency).transform_values { |value| value.to_s.strip } }
        payload = { lines: normalized.map { |line| line.sort.to_h }, supplier: supplier.to_s.strip, invoice: invoice_reference.to_s.strip, reason: reason.to_s.strip, actor: actor.id }
        digest = Digest::SHA256.hexdigest(JSON.generate(payload))
        Access.with(practice.id, actor, "receive") do |profile|
          Access.retry_lock(practice.id, request_key)
          existing = Clinic::Inventory::Receipt.find_by(practice_id: practice.id, request_key: request_key)
          if existing
            raise ArgumentError, "This receipt form was already used for different data. Reload and try again." unless existing.payload_digest == digest
            return existing
          end
          # Fixed product order prevents deadlocks for multi-line shipments.
          products = Clinic::Inventory::PharmacyProduct.where(practice_id: practice.id, id: normalized.map { |line| line[:product_id] }).order(:id).lock.index_by { |product| product.id.to_s }
          vendor = if payload[:supplier].present?
            Clinic::Inventory::Supplier.create_or_find_by!(practice_id: practice.id, name: payload[:supplier])
          end
          receipt = Clinic::Inventory::Receipt.create!(practice_id: practice.id, actor_id: actor.id, profile_id: profile.id, supplier: vendor, received_at: Time.current, invoice_reference: payload[:invoice].presence, reason: payload[:reason], request_key: request_key, payload_digest: digest)
          normalized.each_with_index do |line, index|
            product = products.fetch(line[:product_id]) { raise ActiveRecord::RecordNotFound }
            raise ArgumentError, "Reactivate this product before adding stock." unless product.active?
            unit = line[:input_unit].presence || "package"
            raise ArgumentError, "Choose package or #{product.stock_unit}." unless [ "package", product.stock_unit ].include?(unit)
            factor = unit == "package" ? product.package_size : BigDecimal("1")
            amount = Quantity.parse(line[:amount], scale: unit == "package" ? 0 : product.quantity_scale)
            quantity = Quantity.parse((amount * factor).to_s("F"), scale: product.quantity_scale)
            expiry = Date.iso8601(line[:expires_on])
            lot = Clinic::Inventory::Lot.find_or_create_by!(practice_id: practice.id, product_id: product.id, number: line[:lot_number]) { |record| record.expires_on = expiry }
            raise ArgumentError, "This lot has a different recorded expiry. Resolve the discrepancy before receiving." unless lot.expires_on == expiry
            location = Clinic::Inventory::Location.create_or_find_by!(practice_id: practice.id, name: line[:location])
            batch = product.batches.find_or_create_by!(practice_id: practice.id, lot_id: lot.id, location_id: location.id) do |record|
              record.lot_number = lot.number
              record.expires_on = lot.expires_on
              record.location = location.name
            end
            cost = line[:unit_cost].present? ? Quantity.parse(line[:unit_cost], scale: 6, zero: true) : nil
            currency = line[:currency].presence
            raise ArgumentError, "Provide a three-letter currency with cost, or leave both unknown." unless (cost.nil? && currency.nil?) || (!cost.nil? && currency&.match?(/\A[A-Z]{3}\z/))
            row = receipt.lines.create!(practice_id: practice.id, batch: batch, input_quantity: amount, input_unit: unit, conversion_factor: factor, stock_unit: product.stock_unit, quantity: quantity, unit_cost: cost, currency: currency)
            batch.with_lock do
              batch.movements.create!(practice_id: practice.id, actor: actor, profile_id: profile.id, receipt_line_id: row.id, quantity: quantity, stock_unit: product.stock_unit, kind: "receipt", reason: receipt.reason, request_key: index.zero? ? request_key : "#{request_key}:#{index}", occurred_at: receipt.received_at)
            end
          end
          receipt
        end
      rescue Date::Error
        raise ArgumentError, "Enter a valid lot expiry date."
      end
    end
  end
end
