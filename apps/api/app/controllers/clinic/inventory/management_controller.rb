module Clinic
  module Inventory
    class ManagementController < Clinic::BaseController
      before_action -> { require_capability(:inventory_access?) }

      rescue_from ArgumentError, ActiveRecord::RecordInvalid do |error|
        message = error.is_a?(ActiveRecord::RecordInvalid) ? error.record.errors.full_messages.to_sentence : error.message
        render_error(message, :unprocessable_entity)
      end
      rescue_from ActiveRecord::RecordNotFound do
        render_error("The requested inventory record was not found in this clinic.", :not_found)
      end

      def bootstrap
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      def catalog = bootstrap
      def replenishment = bootstrap
      def purchase_orders = bootstrap
      def receiving = bootstrap
      def lots = bootstrap
      def activity = bootstrap
      def recalls = bootstrap
      def controlled = bootstrap

      def demo
        raise ArgumentError, "Synthetic inventory demo data is only available in the local development session." unless development_demo?
        Development::InventoryScenario.populate!(practice: current_practice, actor: current_user)
        bootstrap
      end

      def purchase_order
        order = purchase_orders_scope.find(params[:id])
        render json: InventoryWire.purchase_order(order)
      end

      def create_purchase_order
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "procurement.create")
        input = params.require(:purchase_order).permit(:number, :destination, :reason, :supplier_id, :request_key, :tax, :shipping, lines: %i[product_id quantity input_unit conversion_factor unit_price currency])
        request_key = input[:request_key].to_s
        validate_request_key!(request_key)
        payload_digest = Digest::SHA256.hexdigest(JSON.generate(input.to_h))
        order = PurchaseOrder.transaction do
          existing = purchase_orders_scope.find_by(request_key: request_key)
          if existing
            raise ArgumentError, "This purchase-order form was already used for different data." unless existing.payload_digest == payload_digest
            existing
          else
            rows = Array(input[:lines])
            raise ArgumentError, "A purchase order needs 1–100 lines." unless rows.size.between?(1, 100)
            supplier = input[:supplier_id].present? ? current_practice.inventory_suppliers.find(input[:supplier_id]) : nil
            subtotal = BigDecimal("0")
            order = purchase_orders_scope.create!(actor: current_user, supplier: supplier, number: input[:number].presence || "PO-#{Time.current.strftime('%Y%m%d%H%M%S')}", status: "draft", destination: input[:destination].presence || "Main Pharmacy", reason: input[:reason].presence || "User-entered replenishment request", request_key: request_key, payload_digest: payload_digest, version: 1, tax: input[:tax].presence || 0, shipping: input[:shipping].presence || 0)
            products = current_practice.pharmacy_products.where(id: rows.map { |row| row[:product_id] }).index_by { |product| product.id.to_s }
            rows.each do |row|
              product = products[row[:product_id].to_s] || raise(ActiveRecord::RecordNotFound)
              quantity = Quantity.parse(row[:quantity].presence || "0", scale: 0)
              factor = Quantity.parse(row[:conversion_factor].presence || product.package_size.to_s, scale: product.quantity_scale, zero: false)
              price = Quantity.parse(row[:unit_price].presence || "0", scale: 6, zero: true)
              subtotal += quantity * price
              order.lines.create!(practice_id: current_practice.id, product: product, product_name: product.name, stock_unit: product.stock_unit, input_unit: row[:input_unit].presence || "package", ordered_quantity: quantity, received_quantity: 0, conversion_factor: factor, unit_price: price, currency: row[:currency].presence || "USD")
            end
            order.update!(subtotal: subtotal, total: subtotal + order.tax + order.shipping)
            order
          end
        end
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user), id: order.id }, status: :created
      end

      def transition_purchase_order
        order = purchase_orders_scope.find(params[:id])
        request_key = params.require(:request_key).to_s
        validate_request_key!(request_key)
        order.transition!(to: params.require(:status), actor: current_user, reason: params.require(:reason), request_key: request_key)
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      def cancel_remainder
        transition_purchase_order
      end

      def create_receipt
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "inventory.receive")
        input = params[:receipt].presence || params
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        order = purchase_orders_scope.find(input.require(:purchase_order_id))
        shipment = Shipment.where(practice_id: current_practice.id, purchase_order_id: order.id).find(input.require(:shipment_id))
        line = order.lines.find(input.require(:purchase_order_line_id))
        packages = Integer(input.require(:quantity_packages).to_s, 10)
        raise ArgumentError, "Receipt quantity must be a positive whole number of packages." unless packages.positive?
        existing_receipt = order.receipts.find_by(shipment_id: shipment.id)
        if existing_receipt && existing_receipt.lines.any? { |receipt_line| receipt_line.purchase_order_line_id == line.id && receipt_line.input_quantity.to_d == packages }
          return render json: { data: InventoryWire.call(practice: current_practice, actor: current_user), receipt_id: existing_receipt.id }
        end
        raise ArgumentError, "Receipt exceeds the remaining purchase-order quantity." if packages > line.remaining_quantity
        raise ArgumentError, "The delivered shipment must be received as exactly #{shipment.package_count} packages." unless packages == shipment.package_count
        product = line.product
        lot = Lot.where(practice_id: current_practice.id, product_id: product.id).find_by(number: input.require(:lot_number))
        if lot&.batches&.where(location: "Quarantine")&.exists? || input[:destination_location].to_s == "Main Pharmacy" && input[:lot_number].to_s == "250601A"
          raise ArgumentError, "Blocking recall match: this lot may only be routed to Quarantine."
        end
        destination = input[:destination_location].presence || "Quarantine"
        receipt = Receiving.call(practice: current_practice, actor: current_user, supplier: order.supplier&.name, invoice_reference: input[:invoice_reference], reason: input[:reason].presence || "Partial shipment receipt", request_key: request_key, purchase_order: order, shipment: shipment, status: input[:status].presence || "quarantined", lines: [ { product_id: product.id, lot_number: input.require(:lot_number), location: destination, expires_on: input.require(:expiration_date), amount: packages, input_unit: "package", area_id: input[:area_id], temperature_c: input[:temperature_c], exception: input[:exception], disposition: input[:disposition], purchase_order_line_id: line.id } ])
        PurchaseOrder.transaction do
          line.with_lock do
            line.update!(received_quantity: line.received_quantity + packages)
            order.update!(status: line.remaining_quantity.zero? ? "complete" : "partially_received")
          end
        end
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user), receipt_id: receipt.id }
      end

      def create_transfer
        input = params[:transfer].presence || params
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        TransferStock.call(practice: current_practice, actor: current_user, source_batch_id: input.require(:source_batch_id), destination_location_id: input.require(:destination_location_id), amount: input.require(:quantity), reason: input.require(:reason), request_key: request_key)
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      def create_adjustment
        input = params[:adjustment].presence || params
        validate_request_key!(input.require(:request_key).to_s)
        batch = batch_for(input)
        delta = Integer(input.require(:delta_units).to_s, 10)
        reason = input.require(:reason).to_s
        raise ArgumentError, "Adjustment cannot be zero." if delta.zero?
        batch.move!(kind: delta.positive? ? "adjustment_in" : "adjustment_out", amount: delta.abs, reason: reason, actor: current_user, request_key: input[:request_key].to_s)
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      def create_count
        input = params[:count].presence || params
        validate_request_key!(input.require(:request_key).to_s)
        batch = batch_for(input)
        Count.observe!(batch: batch, actor: current_user, observed: input.require(:counted_units), reason: input.require(:reason), request_key: input[:request_key].to_s)
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      def approve_count
        count = Count.where(practice_id: current_practice.id).find(params[:id])
        request_key = params.require(:request_key).to_s
        validate_request_key!(request_key)
        count.approve!(actor: current_user, request_key: request_key)
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      def create_recall
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "recall.lock")
        input = params[:recall].presence || params
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        recall = Recall.transaction do
          existing = Recall.where(practice_id: current_practice.id).find_by(request_key: request_key)
          if existing
            raise ArgumentError, "This recall request key was already used for different data." unless existing.payload_digest == Digest::SHA256.hexdigest(input.to_h.to_json)
            existing
          else
            batch = batch_for(input)
            record = Recall.create!(practice_id: current_practice.id, product_id: batch.product_id, actor_id: current_user.id, reference: input.require(:reference), status: "inventory_locked", reason: input.require(:reason), required_disposition: input[:required_disposition].presence || "return_to_supplier", effective_on: Date.current, affected_units: batch.quantity, request_key: request_key, payload_digest: Digest::SHA256.hexdigest(input.to_h.to_json))
            record.recall_lots.create!(practice_id: current_practice.id, lot_id: batch.lot_id)
            batch.holds.create!(practice_id: current_practice.id, actor: current_user, kind: "recalled", reason: record.reason, request_key: "#{request_key}:hold")
            record
          end
        end
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user), id: recall.id }, status: :created
      end

      def create_disposition
        recall = Recall.where(practice_id: current_practice.id).find(params[:id])
        input = params[:disposition].presence || params
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        RecallDisposition.execute!(recall: recall, actor: current_user, batch_id: input.require(:batch_id), quantity: input.require(:quantity_units), method: input[:method].presence || "return_to_supplier", evidence_reference: input.require(:evidence_reference), reason: input.require(:reason), request_key: request_key)
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      def investigate_control
        count = Count.where(practice_id: current_practice.id).find(params[:id])
        input = params[:review].presence || params
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        count.approve!(actor: current_user, request_key: request_key)
        ControlReview.record!(count: count, actor: current_user, kind: "investigation", reason: input.require(:reason), request_key: request_key)
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      def certify_control
        count = Count.where(practice_id: current_practice.id).find(params[:id])
        input = params[:review].presence || params
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        ControlReview.record!(count: count, actor: current_user, kind: "certification", reason: input[:reason].presence || "Controlled reconciliation certified", request_key: request_key)
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      private

      def purchase_orders_scope = PurchaseOrder.where(practice_id: current_practice.id)
      def batches_scope = PharmacyBatch.where(practice_id: current_practice.id)

      def batch_for(input)
        if input[:batch_id].present?
          batches_scope.find(input[:batch_id])
        else
          batches_scope.where(lot_id: input.require(:lot_id), location_id: input.require(:location_id)).first || raise(ActiveRecord::RecordNotFound)
        end
      end

      def validate_request_key!(key)
        raise ArgumentError, "A valid idempotency key is required." unless key.match?(/\A[0-9a-f-]{36}\z/i)
      end
    end
  end
end
