module Clinic
  module Inventory
    class Receiving
      # One request is a delivery with one or more lot allocations. Costs are per
      # input unit, unknown remains null; this does not order goods or bill fees.
      def self.call(practice:, actor:, lines:, reason:, request_key:, supplier: nil, invoice_reference: nil, purchase_order: nil, shipment: nil, status: "received", recall: nil, received_at: Current.business_time, reconciliation: nil)
        raise ArgumentError, "A receipt needs 1–100 lines." unless lines.is_a?(Array) && lines.size.between?(1, 100)
        raise ArgumentError, "Choose received or recall quarantine." unless %w[received quarantined].include?(status.to_s)
        raise ArgumentError, "Provide structured discrepancy counts." if reconciliation && !reconciliation.is_a?(Hash)
        reconciliation = ShipmentReconciliation.normalize(reconciliation)
        raise ArgumentError, "A discrepancy needs a delivered shipment." if reconciliation && !shipment
        normalized = lines.map do |line|
          normalized_line = line.symbolize_keys.slice(:product_id, :lot_number, :location_id, :location, :expires_on, :amount, :input_unit, :unit_cost, :currency, :purchase_order_line_id, :area_id, :temperature_c, :exception, :disposition).transform_values { |value| value.to_s.strip }
          normalized_line.delete(:location_id) if normalized_line[:location_id].blank?
          normalized_line
        end
        if reconciliation && normalized.any? { |line| line[:lot_number].to_s.length > 160 || line[:expires_on].to_s.length > 30 || line[:temperature_c].to_s.length > 30 }
          raise ArgumentError, "Keep lot observations within 160 characters and expiry/temperature observations within 30 characters."
        end
        payload = { purchase_order_id: purchase_order&.id, shipment_id: shipment&.id, recall_id: recall&.id, status: status.to_s, lines: normalized.map { |line| line.sort.to_h }, supplier: supplier.to_s.strip, invoice: invoice_reference.to_s.strip, reason: reason.to_s.strip, actor: actor.id }
        payload[:reconciliation] = reconciliation if reconciliation
        digest = Digest::SHA256.hexdigest(JSON.generate(payload))
        Clinic::Inventory::Receipt.transaction do
          Access.with(practice.id, actor, "receive") do |profile|
            Access.retry_lock(practice.id, request_key)
            existing = Clinic::Inventory::Receipt.find_by(practice_id: practice.id, request_key: request_key) || ShipmentReconciliation.find_by(practice_id: practice.id, request_key: request_key)
            if existing
              raise ArgumentError, "This receipt form was already used for different data. Reload and try again." unless existing.payload_digest == digest
              return existing
            end
            # Match shipment creation's order-before-shipment locking order.
            purchase_order = practice.inventory_purchase_orders.lock.find(purchase_order.id) if purchase_order
            if purchase_order && !%w[sent partially_received].include?(purchase_order.status)
              raise ArgumentError, "Only sent or partially received purchase orders can receive stock."
            end
            if shipment
              shipment = Shipment.where(practice_id: practice.id).find(shipment.id)
            end
            shipment&.with_lock do
              validate_shipment!(shipment, purchase_order, normalized, reconciliation)
              raise ArgumentError, "This shipment has already been received or reconciled." if shipment.receipts.exists? || shipment.reconciliation.present?
            end
            accepted_packages = normalized.sum { |line| Quantity.parse(line[:amount], scale: 0, zero: true) } if reconciliation
            record_reconciliation = lambda do |receipt|
              ShipmentReconciliation.create!(reconciliation.merge(practice: practice, shipment: shipment, receipt: receipt,
                actor: actor, profile: profile, accepted_packages: accepted_packages, reason: payload[:reason], request_key: request_key, payload_digest: digest,
                observations: normalized.map { |line| line.slice(:product_id, :lot_number, :expires_on, :temperature_c) }))
            end
            return record_reconciliation.call(nil) if reconciliation && accepted_packages.zero?
            # Fixed product order prevents deadlocks for multi-line shipments.
            products = Clinic::Inventory::PharmacyProduct.where(practice_id: practice.id, id: normalized.map { |line| line[:product_id] }).order(:id).lock.index_by { |product| product.id.to_s }
            order_lines = purchase_order ? purchase_order.lines.where(practice_id: practice.id).order(:id).lock.index_by { |line| line.id.to_s } : {}
            vendor = if payload[:supplier].present?
              Clinic::Inventory::Supplier.create_or_find_by!(practice_id: practice.id, name: payload[:supplier])
            end
            receipt = Clinic::Inventory::Receipt.create!(practice_id: practice.id, actor_id: actor.id, profile_id: profile.id, supplier: vendor, purchase_order_id: purchase_order&.id, shipment_id: shipment&.id, status: status, received_at: received_at, invoice_reference: payload[:invoice].presence, reason: payload[:reason], request_key: request_key, payload_digest: digest, created_at: received_at, updated_at: received_at)
            record_reconciliation.call(receipt) if reconciliation
            normalized.each_with_index do |line, index|
            next if reconciliation && Quantity.parse(line[:amount], scale: 0, zero: true).zero?
            product = products.fetch(line[:product_id]) { raise ActiveRecord::RecordNotFound }
            raise ArgumentError, "Reactivate this product before adding stock." unless product.active?
            unit = line[:input_unit].presence || "package"
            package_unit = InventoryWire::PACKAGE_INPUT_UNIT
            raise ArgumentError, "Choose #{package_unit} or #{product.stock_unit}." unless [ package_unit, product.stock_unit ].include?(unit)
            purchase_line = if purchase_order || line[:purchase_order_line_id].present?
              candidate = order_lines.fetch(line[:purchase_order_line_id]) { raise ArgumentError, "Choose a line from this receipt's purchase order." }
              unless candidate.product_id == product.id && candidate.stock_unit == product.stock_unit && unit == package_unit && candidate.input_unit == package_unit
                raise ArgumentError, "Receipt units and product must match the purchase-order line."
              end
              candidate
            end
            factor = unit == package_unit ? (purchase_line&.conversion_factor || product.package_size) : BigDecimal("1")
            amount = Quantity.parse(line[:amount], scale: unit == "package" ? 0 : product.quantity_scale)
            quantity = Quantity.parse((amount * factor).to_s("F"), scale: product.quantity_scale)
            expiry = Date.iso8601(line[:expires_on])
            lot = Clinic::Inventory::Lot.find_or_create_by!(practice_id: practice.id, product_id: product.id, number: line[:lot_number]) { |record| record.expires_on = expiry }
            raise ArgumentError, "This lot has a different recorded expiry. Resolve the discrepancy before receiving." unless lot.expires_on == expiry
            matching_recalls = open_recalls_for(practice, product, lot)
            if matching_recalls.any?
              raise ArgumentError, "Stock for an open recall must be received into recall quarantine." unless status.to_s == "quarantined"
              unless recall && matching_recalls.any? { |record| record.id == recall.id }
                raise ArgumentError, "Confirm one of the open recall cases for this lot before receiving."
              end
              Clinic::Authorization.authorize!(actor: actor, practice: practice, action: "recall.lock")
            elsif Recall.where(practice_id: practice.id, product_id: product.id).joins(:recall_lots)
              .exists?(clinic_inventory_recall_lots: { lot_id: lot.id })
              raise ArgumentError, "This lot belongs to a closed recall. Open a new recall case before receiving it into quarantine."
            elsif status.to_s == "quarantined"
              raise ArgumentError, "A quarantined receipt needs an open recall record."
            end
            location = resolve_location!(practice, line)
            restricted_kind = location.restricted_kind
            if status.to_s == "received" && %w[quarantine returns].include?(restricted_kind)
              raise ArgumentError, "A normal receipt cannot be placed in a quarantine or returns location."
            elsif status.to_s == "quarantined" && restricted_kind != "quarantine"
              raise ArgumentError, "A quarantined receipt must use a quarantine location."
            end
            batch = product.batches.find_or_create_by!(practice_id: practice.id, lot_id: lot.id, location_id: location.id) do |record|
              record.lot_number = lot.number
              record.expires_on = lot.expires_on
              record.location = location.name
              record.supplier = payload[:supplier].presence
            end
            matching_recalls.each do |matching_recall|
              active_hold = batch.active_holds.find_by(kind: "recalled", recall_id: matching_recall.id)
              next if active_hold

              batch.holds.create!(practice_id: practice.id, actor: actor, recall: matching_recall, kind: "recalled",
                reason: "Receipt held for recall: #{receipt.reason}", request_key: "#{request_key}:recall-hold:#{index + 1}:#{matching_recall.id}")
            end
            cost = line[:unit_cost].present? ? Quantity.parse(line[:unit_cost], scale: 6, zero: true) : nil
            currency = line[:currency].presence
            raise ArgumentError, "Provide a three-letter currency with cost, or leave both unknown." unless (cost.nil? && currency.nil?) || (!cost.nil? && currency&.match?(/\A[A-Z]{3}\z/))
            row = receipt.lines.create!(practice_id: practice.id, batch: batch, purchase_order_line_id: line[:purchase_order_line_id].presence, area_id: line[:area_id].presence, temperature_c: line[:temperature_c].presence, exception: line[:exception].presence, disposition: line[:disposition].presence, input_quantity: amount, input_unit: unit, conversion_factor: factor, stock_unit: product.stock_unit, quantity: quantity, unit_cost: cost, currency: currency, created_at: received_at, updated_at: received_at)
            batch.with_lock do
              batch.movements.create!(practice_id: practice.id, actor: actor, profile_id: profile.id, receipt_line_id: row.id, quantity: quantity, stock_unit: product.stock_unit, kind: "receipt", reason: receipt.reason, request_key: index.zero? ? request_key : "#{request_key}:#{index}", occurred_at: receipt.received_at, created_at: received_at, updated_at: received_at)
            end
            if purchase_order && line[:purchase_order_line_id].present?
              purchase_order.with_lock do
                raise ArgumentError, "Receipt exceeds the remaining purchase-order quantity." if amount > purchase_line.remaining_quantity
                purchase_line.update!(received_quantity: purchase_line.received_quantity + amount)
                purchase_order.update!(status: purchase_order.lines.all? { |order_line| order_line.remaining_quantity.zero? } ? "complete" : "partially_received")
              end
            end
            end
            receipt
          end
        end
      rescue Date::Error
        raise ArgumentError, "Enter a valid lot expiry date."
      end

      def self.validate_shipment!(shipment, purchase_order, lines, reconciliation)
        raise ArgumentError, "A receipt shipment must belong to its purchase order." unless purchase_order && shipment.purchase_order_id == purchase_order.id
        raise ArgumentError, "Only delivered or exception shipments can be received." unless %w[delivered exception].include?(shipment.effective_status)
        allocations = shipment.shipment_lines.includes(purchase_order_line: :product).index_by { |line| line.purchase_order_line_id.to_s }
        raise ArgumentError, "A shipment needs immutable purchase-order allocation evidence." if allocations.empty?
        package_total = lines.sum do |line|
          allocation = allocations.fetch(line[:purchase_order_line_id].to_s) { raise ArgumentError, "The receipt line is not allocated to this shipment." }
          order_line = allocation.purchase_order_line
          raise ArgumentError, "The receipt product does not match its purchase-order allocation." unless order_line.product_id.to_s == line[:product_id].to_s
          raise ArgumentError, "Shipment receipts must use #{InventoryWire::PACKAGE_INPUT_UNIT} quantities." unless line[:input_unit] == InventoryWire::PACKAGE_INPUT_UNIT
          amount = Quantity.parse(line[:amount], scale: 0, zero: reconciliation.present?)
          raise ArgumentError, "The receipt exceeds its shipment allocation." if amount > allocation.expected_packages
          amount
        end
        expected_packages = allocations.values.sum(&:expected_packages)
        expected_units = allocations.values.sum { |allocation| allocation.expected_packages * allocation.purchase_order_line.conversion_factor }
        raise ArgumentError, "The shipment allocation does not match its recorded expected units." unless expected_units == shipment.expected_units
        if reconciliation
          raise ArgumentError, "Choose a discrepancy reason." unless ShipmentReconciliation::KINDS.include?(reconciliation[:exception])
          missing, rejected, excess = %i[missing_packages rejected_packages excess_packages].map { |key| reconciliation.fetch(key).to_d }
          raise ArgumentError, "Record missing, rejected or excess packages for a discrepancy." unless missing + rejected + excess > 0
          raise ArgumentError, "Accepted, missing and rejected packages must equal the shipment allocation." unless package_total + missing + rejected == expected_packages
        else
          raise ArgumentError, "The received packages do not match the shipment allocation." unless package_total == expected_packages
        end
      end

      def self.open_recalls_for(practice, product, lot)
        ids = Recall.open_cases.where(practice_id: practice.id, product_id: product.id)
          .joins(:recall_lots).where(clinic_inventory_recall_lots: { lot_id: lot.id }).order(:id).pluck(:id)
        Recall.where(practice_id: practice.id, id: ids).order(:id).lock.to_a
      end

      def self.resolve_location!(practice, line)
        if line[:location_id].present?
          location = Location.where(practice_id: practice.id).includes(:site, :children, :parent_location).lock.find(line[:location_id])
          if line[:location].present? && line[:location] != location.name
            raise ArgumentError, "The selected inventory location does not match its recorded name. Reload and try again."
          end
        else
          name = line[:location].to_s.strip
          raise ArgumentError, "Choose an inventory location." if name.blank?

          matches = Location.where(practice_id: practice.id, name: name).includes(:site, :children, :parent_location).lock.limit(2).to_a
          raise ActiveRecord::RecordNotFound if matches.empty?
          raise ArgumentError, "More than one inventory bin has this name. Reload and choose its exact location." if matches.many?
          location = matches.sole
        end
        location.ensure_stock_destination!
      end
      private_class_method :validate_shipment!, :open_recalls_for, :resolve_location!
    end
  end
end
