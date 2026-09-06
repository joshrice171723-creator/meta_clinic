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
      rescue_from PurchaseCartCheckout::OfferChanged do |error|
        render json: { error: error.message, code: "cart_offer_changed" }, status: :conflict
      end

      def bootstrap
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      def catalog
        return bootstrap unless params[:view] == "table"

        render json: { data: InventoryWire.catalog(practice: current_practice, actor: current_user, query: params[:q], status: params[:status], sort: params[:sort], page: params[:page]) }
      end

      def create_location
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "inventory.configure")
        input = params.require(:location).permit(:name, :kind, :address_line1, :address_line2, :city, :state, :postal_code, :country)
        location = current_practice.inventory_locations.create!(input.merge(country: input[:country].presence || "US"))
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user), id: location.id }, status: :created
      end

      def update_product
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "inventory.catalog")
        product = current_practice.pharmacy_products.find(params[:id])
        product.update_catalog!(params.require(:product).permit(:reorder_point, :active), actor: current_user)
        head :no_content
      end

      def replenishment = bootstrap
      def purchase_cart
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      def update_purchase_cart
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "procurement.create")
        cart = PurchaseCart.active_for(practice: current_practice, actor: current_user)
        input = params.require(:cart).permit(:destination_site_id, :reason)
        cart.with_draft_lock do
          cart.update!(destination_site: cart_destination(input[:destination_site_id]), reason: input[:reason].to_s.strip.presence)
        end
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end
      def purchase_orders = bootstrap
      def receiving = bootstrap
      def lots = bootstrap
      def activity
        return bootstrap unless params[:view] == "ledger"

        render json: { data: InventoryWire.activity(practice: current_practice, actor: current_user, query: params[:q], before: params[:before]) }
      end
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
        input = params.require(:purchase_order).permit(:number, :destination, :destination_location_id, :receiving_site_id, :destination_address, :reason, :supplier_id, :request_key, :tax, :shipping, lines: %i[product_id quantity input_unit conversion_factor unit_price currency])
        request_key = input[:request_key].to_s
        validate_request_key!(request_key)
        payload_digest = Digest::SHA256.hexdigest(JSON.generate({ actor_id: current_user.id, payload: input.to_h.deep_stringify_keys.sort.to_h }))
        order = PurchaseOrder.transaction do
          Access.retry_lock(current_practice.id, request_key)
          existing = purchase_orders_scope.find_by(request_key: request_key)
          if existing
            raise ArgumentError, "This purchase-order form was already used for different data." unless existing.payload_digest == payload_digest
            existing
          else
            rows = Array(input[:lines])
            raise ArgumentError, "A purchase order needs 1–100 lines." unless rows.size.between?(1, 100)
            supplier = input[:supplier_id].present? ? current_practice.inventory_suppliers.find(input[:supplier_id]) : nil
            receiving_site = if input[:receiving_site_id].present?
              current_practice.sites.find(input[:receiving_site_id])
            end
            if receiving_site
              raise ArgumentError, "The selected facility must be active before it can receive a purchase order." unless receiving_site.status == "active"
              raise ArgumentError, "The selected facility needs a complete shipping address." unless receiving_site.shipping_address?
            end
            destination_location = if input[:destination_location_id].present? && receiving_site.nil?
              current_practice.inventory_locations.find(input[:destination_location_id])
            end
            if destination_location
              raise ArgumentError, "Purchase orders must ship to a storage or controlled location." if %w[quarantine returns].include?(destination_location.kind)
              raise ArgumentError, "The selected receiving location needs a complete shipping address." unless destination_location.shipping_address?
            end
            destination = receiving_site&.name || receiving_site&.code || destination_location&.name || input[:destination].to_s
            destination_address = receiving_site&.formatted_address || destination_location&.formatted_address || input[:destination_address].presence
            raise ArgumentError, "A shipping destination is required." if destination.blank?
            subtotal = BigDecimal("0")
            order_currency = nil
            order = purchase_orders_scope.create!(actor: current_user, supplier: supplier, receiving_site: receiving_site, number: input[:number].presence || "PO-#{SecureRandom.hex(12)}", status: "draft", destination: destination, destination_address: destination_address, reason: input.require(:reason), request_key: request_key, payload_digest: payload_digest, version: 1, tax: input[:tax].presence || 0, shipping: input[:shipping].presence || 0)
            products = current_practice.pharmacy_products.where(id: rows.map { |row| row[:product_id] }).index_by { |product| product.id.to_s }
            rows.each do |row|
              product = products[row[:product_id].to_s] || raise(ActiveRecord::RecordNotFound)
              quantity = Quantity.parse(row[:quantity].presence || "0", scale: 0)
              package_factor = Quantity.parse(product.package_size.to_s, scale: product.quantity_scale, zero: false)
              input_unit = row[:input_unit].presence || InventoryWire::PACKAGE_INPUT_UNIT
              supplied_factor = row[:conversion_factor].presence && Quantity.parse(row[:conversion_factor], scale: product.quantity_scale, zero: false)
              raise ArgumentError, "Purchase orders must use the product's package unit." unless input_unit == InventoryWire::PACKAGE_INPUT_UNIT
              raise ArgumentError, "The package conversion factor does not match the catalog." if supplied_factor && supplied_factor != package_factor
              factor = package_factor
              price = Quantity.parse(row[:unit_price].presence || "0", scale: 6, zero: true)
              currency = row.require(:currency).to_s.upcase
              raise ArgumentError, "Currency must be a three-letter ISO code." unless currency.match?(/\A[A-Z]{3}\z/)
              if order_currency && order_currency != currency
                raise ArgumentError, "A purchase order cannot contain multiple currencies."
              end
              order_currency ||= currency
              subtotal += quantity * price
              order.lines.create!(practice_id: current_practice.id, product: product, product_name: product.name, stock_unit: product.stock_unit, input_unit: input_unit, ordered_quantity: quantity, received_quantity: 0, conversion_factor: factor, unit_price: price, currency: currency)
            end
            order.update!(subtotal: subtotal, total: subtotal + order.tax + order.shipping)
            order
          end
        end
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user), id: order.id }, status: :created
      end

      def add_purchase_cart_item
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "procurement.create")
        input = params.require(:item).permit(:product_id, :requested_packages, :source, :destination_site_id, :reason)
        cart = PurchaseCart.active_for(practice: current_practice, actor: current_user)
        cart.with_draft_lock do
          product = current_practice.pharmacy_products.lock("FOR SHARE").find(input.require(:product_id))
          quantity = Quantity.parse(input.require(:requested_packages), scale: 0, zero: false)
          cart.update!(destination_site: input[:destination_site_id].present? ? cart_destination(input[:destination_site_id]) : cart.destination_site, reason: input[:reason].presence || cart.reason)
          item = cart.items.find_or_initialize_by(practice_id: current_practice.id, product_id: product.id)
          raise ArgumentError, "A purchase cart supports at most 100 products." if item.new_record? && cart.items.count >= 100
          quantity += item.requested_packages.to_d if item.persisted?
          quantity = Quantity.parse(quantity.to_s("F"), scale: 0, zero: false)
          offer = PurchaseCartCheckout.select_offer(product: product, requested_packages: quantity)
          item.assign_attributes(requested_packages: quantity, input_unit: "package", conversion_factor: offer.supplier_product.package_quantity,
            selected_supplier_product: offer.supplier_product, selected_supplier: offer.supplier, selected_unit_price: offer.supplier_product.wholesale_unit_cost,
            selected_currency: offer.supplier_product.currency, selected_package_quantity: offer.supplier_product.package_quantity,
            price_snapshot_at: offer.captured_at, price_snapshot_digest: offer.digest, source: input[:source].presence || "manual", status: "draft")
          item.save!
        end
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }, status: :created
      end

      def update_purchase_cart_item
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "procurement.create")
        item = PurchaseCartItem.where(practice_id: current_practice.id).joins(:cart).where(clinic_inventory_purchase_carts: { actor_id: current_user.id, status: "draft" }).find(params[:id])
        item.cart.with_draft_lock do
          item.reload
          product = current_practice.pharmacy_products.lock("FOR SHARE").find(item.product_id)
          quantity = Quantity.parse(params.require(:item).require(:requested_packages), scale: 0, zero: false)
          offer = PurchaseCartCheckout.select_offer(product: product, requested_packages: quantity)
          item.update!(requested_packages: quantity, conversion_factor: offer.supplier_product.package_quantity, selected_supplier_product: offer.supplier_product, selected_supplier: offer.supplier,
            selected_unit_price: offer.supplier_product.wholesale_unit_cost, selected_currency: offer.supplier_product.currency, selected_package_quantity: offer.supplier_product.package_quantity,
            price_snapshot_at: offer.captured_at, price_snapshot_digest: offer.digest)
        end
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      def remove_purchase_cart_item
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "procurement.create")
        item = PurchaseCartItem.where(practice_id: current_practice.id).joins(:cart).where(clinic_inventory_purchase_carts: { actor_id: current_user.id, status: "draft" }).find(params[:id])
        item.cart.with_draft_lock { item.reload.destroy! }
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      def checkout_purchase_cart
        input = params.require(:checkout).permit(:cart_id, :request_key)
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        cart, orders = PurchaseCartCheckout.call(practice: current_practice, actor: current_user, cart_id: input.require(:cart_id), request_key: request_key)
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user), checkout_group_id: cart.checkout_group_id, purchase_order_ids: orders.map(&:id) }, status: :created
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

      def create_shipment
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "inventory.receive")
        input = (params[:shipment].presence || params).permit(:purchase_order_id, :purchase_order_line_id, :reference, :supplier_reference, :package_count, :delivered_at, :request_key)
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        payload_digest = Digest::SHA256.hexdigest(JSON.generate({ actor_id: current_user.id, payload: input.to_h.deep_stringify_keys.sort.to_h }))
        shipment = Access.with(current_practice.id, current_user, "receive") do |_profile|
          Access.retry_lock(current_practice.id, request_key)
          existing = current_practice.inventory_shipments.find_by(request_key: request_key)
          if existing
            raise ArgumentError, "This shipment form was already used for different data." unless existing.payload_digest == payload_digest
            existing
          else
            order = purchase_orders_scope.lock.find(input.require(:purchase_order_id))
            raise ArgumentError, "Only sent or partially received purchase orders can receive a delivery." unless %w[sent partially_received].include?(order.status)
            line = order.lines.where(practice_id: current_practice.id).lock.find(input.require(:purchase_order_line_id))
            packages = Integer(input.require(:package_count).to_s, 10)
            raise ArgumentError, "Shipment quantity must be a positive whole number of packages." unless packages.positive?
            open_packages = ShipmentLine.where(practice_id: current_practice.id, purchase_order_line_id: line.id)
              .where.not(shipment_id: Receipt.where(practice_id: current_practice.id).where.not(shipment_id: nil).select(:shipment_id))
              .where.not(shipment_id: ShipmentReconciliation.where(practice_id: current_practice.id).select(:shipment_id)).sum(:expected_packages)
            raise ArgumentError, "Shipment quantity exceeds the unallocated purchase-order quantity." if packages.to_d > line.remaining_quantity - open_packages
            reference = input.require(:reference).to_s.strip
            supplier_reference = input.require(:supplier_reference).to_s.strip
            raise ArgumentError, "Shipment reference is required." if reference.blank?
            raise ArgumentError, "Supplier delivery reference is required." if supplier_reference.blank?
            delivered_at = input[:delivered_at].present? ? Time.iso8601(input[:delivered_at].to_s) : Time.current
            shipment = current_practice.inventory_shipments.create!(
              actor: current_user,
              purchase_order: order,
              reference: reference,
              supplier_reference: supplier_reference,
              status: "delivered",
              package_count: packages,
              expected_units: packages * line.conversion_factor,
              delivered_at: delivered_at,
              request_key: request_key,
              payload_digest: payload_digest
            )
            shipment.shipment_lines.create!(practice_id: current_practice.id, purchase_order_line: line, expected_packages: packages)
            shipment
          end
        end
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user), id: shipment.id }, status: :created
      end

      def create_receipt
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "inventory.receive")
        input = params[:receipt].presence || params
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        order = purchase_orders_scope.find(input.require(:purchase_order_id))
        shipment = Shipment.where(practice_id: current_practice.id, purchase_order_id: order.id).find(input.require(:shipment_id))
        line = order.lines.find(input.require(:purchase_order_line_id))
        packages = Quantity.parse(input.require(:quantity_packages).to_s, scale: 0, zero: true).to_i
        raise ArgumentError, "Provide structured discrepancy counts." unless input[:reconciliation].nil? || input[:reconciliation].is_a?(ActionController::Parameters)
        reconciliation = input[:reconciliation]&.permit(:missing_packages, :rejected_packages, :excess_packages, :exception)&.to_h
        raise ArgumentError, "Receipt quantity must be a nonnegative whole number of packages." if packages.negative?
        product = line.product
        lot = Lot.where(practice_id: current_practice.id, product_id: product.id).find_by(number: input[:lot_number])
        matched_recall = if lot
          current_practice.inventory_recalls.joins(:recall_lots)
            .find_by(product_id: product.id, clinic_inventory_recall_lots: { lot_id: lot.id })
        end
        recalled = matched_recall.present?
        destination = current_practice.inventory_locations.find_by!(name: input.require(:destination_location)) if packages.positive?
        if packages.positive? && recalled && destination.kind != "quarantine"
          raise ArgumentError, "Blocking recall match: this lot must be routed to a quarantine location."
        end
        recall = if recalled && packages.positive?
          Authorization.authorize!(actor: current_user, practice: current_practice, action: "recall.lock")
          current_practice.inventory_recalls.joins(:recall_lots).find_by!(id: input.require(:recall_id), product_id: product.id, clinic_inventory_recall_lots: { lot_id: lot.id })
        elsif input[:recall_id].present?
          raise ArgumentError, "A recall can only be supplied for a recalled lot."
        end
        receipt = Receiving.call(practice: current_practice, actor: current_user, supplier: order.supplier&.name, invoice_reference: input[:invoice_reference], reason: input.require(:reason), request_key: request_key, purchase_order: order, shipment: shipment, recall: recall, reconciliation: reconciliation, status: recall ? "quarantined" : "received", lines: [ { product_id: product.id, lot_number: input[:lot_number], location: destination&.name, expires_on: input[:expiration_date], amount: packages, input_unit: InventoryWire::PACKAGE_INPUT_UNIT, area_id: input[:area_id], temperature_c: input[:temperature_c], exception: input[:exception], disposition: input[:disposition], purchase_order_line_id: line.id } ])
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user), receipt_id: receipt.is_a?(Receipt) ? receipt.id : nil }
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
        delta = Quantity.parse(input.require(:delta_units), scale: batch.product.quantity_scale, zero: true)
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
        input = params.require(:recall).permit(:request_key, :batch_id, :lot_id, :location_id, :reference, :reason, :required_disposition)
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        expected_digest = Digest::SHA256.hexdigest(JSON.generate({ actor_id: current_user.id, payload: input.to_h.deep_stringify_keys.sort.to_h }))
        recall = Recall.transaction do
          Access.retry_lock(current_practice.id, request_key)
          existing = Recall.where(practice_id: current_practice.id).find_by(request_key: request_key)
          if existing
            raise ArgumentError, "This recall request key was already used for different data." unless existing.payload_digest == expected_digest
            existing
          else
            batch = batch_for(input)
            record = Recall.create!(practice_id: current_practice.id, product_id: batch.product_id, actor_id: current_user.id, reference: input.require(:reference), status: "inventory_locked", reason: input.require(:reason), required_disposition: input[:required_disposition].presence || "return_to_supplier", effective_on: Date.current, affected_units: batch.quantity, request_key: request_key, payload_digest: expected_digest)
            record.recall_lots.create!(practice_id: current_practice.id, lot_id: batch.lot_id)
            ApplicationRecord.connection.execute("SELECT set_config('apply.inventory_action', 'recall.lock', true)")
            batch.holds.create!(practice_id: current_practice.id, actor: current_user, recall: record, kind: "recalled", reason: record.reason, request_key: "#{request_key}:hold")
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
        ControlReview.investigate!(count: count, actor: current_user, reason: input.require(:reason), request_key: request_key)
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      def certify_control
        count = Count.where(practice_id: current_practice.id).find(params[:id])
        input = params[:review].presence || params
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        ControlReview.record!(count: count, actor: current_user, kind: "certification", reason: input.require(:reason), request_key: request_key)
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      private

      def purchase_orders_scope = PurchaseOrder.where(practice_id: current_practice.id)
      def batches_scope = PharmacyBatch.where(practice_id: current_practice.id)

      def cart_destination(id)
        return nil if id.blank?

        site = current_practice.sites.lock("FOR SHARE").find(id)
        raise ArgumentError, "The selected facility must be active before checkout." unless site.status == "active"
        site
      end

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
