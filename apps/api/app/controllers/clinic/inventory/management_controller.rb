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
      rescue_from Clinic::Idempotency::Conflict do
        render_error("That request key was already used for different operation data.", :conflict)
      end

      def bootstrap
        render json: { data: InventoryWire.call(practice: current_practice, actor: current_user) }
      end

      def scan
        render json: { data: ScanResolver.call(practice: current_practice, actor: current_user,
          scan_code: params.require(:scan_code), context: params.require(:context),
          product_id: params[:product_id], session_id: params[:session_id], page: params[:page] || 1) }
      end

      def catalog
        return bootstrap unless params[:view] == "table"

        render json: { data: InventoryWire.catalog(practice: current_practice, actor: current_user, query: params[:q], status: params[:status], sort: params[:sort], page: params[:page]) }
      end

      def supplier_pricing
        ability = Ability.new(current_user, practice: current_practice)
        raise Clinic::Authorization::Denied unless ability.role_code_allowed?(Ability::SUPPLIER_PRICING_ROLE_CODES)

        render json: { data: InventoryWire.supplier_pricing(practice: current_practice, actor: current_user, query: params[:q], supplier_id: params[:supplier_id], page: params[:page]) }
      end

      def exceptions
        render json: { data: InventoryWire.exceptions(practice: current_practice, actor: current_user, query: params[:q], status: params[:exception_status], category: params[:category], page: params[:page]) }
      end

      def review_exception
        input = params.require(:review).permit(:source_kind, :source_id, :category, :assignee_id, :state, :reason, :evidence_reference, :request_key)
        review = ExceptionReview.record!(practice: current_practice, actor: current_user, **input.to_h.symbolize_keys)
        render json: { acknowledged: true, id: review.id.to_s }, status: :created
      end

      def locations
        render json: { data: InventoryWire.locations(practice: current_practice, actor: current_user, query: params[:q], status: params[:location_status], page: params[:page]) }
      end

      def create_location
        location = ManageLocation.call(practice: current_practice, actor: current_user, attributes: location_attributes)
        payload = params[:response] == "ack" ? { acknowledged: true } : { data: InventoryWire.call(practice: current_practice, actor: current_user) }
        render json: payload.merge(id: location.id.to_s), status: :created
      end

      def update_location
        location = ManageLocation.call(practice: current_practice, actor: current_user, location_id: params[:id], attributes: location_attributes)
        payload = params[:response] == "ack" ? { acknowledged: true } : { data: InventoryWire.call(practice: current_practice, actor: current_user) }
        render json: payload.merge(id: location.id.to_s)
      end

      def update_product
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "inventory.catalog")
        product = current_practice.pharmacy_products.find(params[:id])
        product.update_catalog!(params.require(:product).permit(:reorder_point, :active), actor: current_user)
        head :no_content
      end

      def replenishment
        return bootstrap unless params[:view] == "plan"

        render json: { data: InventoryWire.replenishment(practice: current_practice, actor: current_user, query: params[:q], mode: params[:plan_mode], page: params[:page], product_id: params[:product_id]) }
      end
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
        params[:response] == "ack" ? render(json: { acknowledged: true }) : bootstrap
      end
      def purchase_orders
        return bootstrap unless params[:view] == "batches"

        render json: { data: InventoryWire.purchasing(practice: current_practice, actor: current_user, query: params[:q], status: params[:order_status], page: params[:page]) }
      end
      def receiving
        if params[:view] == "intake"
          return render json: { data: InventoryWire.delivery_intake(practice: current_practice, actor: current_user,
            query: params[:q], page: params[:page], purchase_order_id: params[:purchase_order_id]) }
        end
        return bootstrap unless params[:view] == "deliveries"

        render json: { data: InventoryWire.receiving(practice: current_practice, actor: current_user, query: params[:q], status: params[:delivery_status], page: params[:page], shipment_id: params[:shipment_id]) }
      end
      def lots
        if params[:view] == "receiving_lookup"
          return render json: { data: InventoryWire.receiving_lot(practice: current_practice, product_id: params.require(:product_id), number: params[:lot_number]) }
        end
        return bootstrap unless params[:view] == "positions"

        render json: { data: InventoryWire.positions(practice: current_practice, actor: current_user, query: params[:q], status: params[:stock_status], product_id: params[:product_id], page: params[:page]) }
      end
      def activity
        return bootstrap unless params[:view] == "ledger"

        render json: { data: InventoryWire.activity(practice: current_practice, actor: current_user, query: params[:q], before: params[:before], lot_id: params[:lot_id]) }
      end
      def recalls
        return bootstrap unless params[:view] == "cases"
        filters = params.permit(:q, :recall_status, :page, :recall_id, :position_page, :history_page, :lot_q, :lot_page, :product_id).to_h.symbolize_keys
        filters[:query] = filters.delete(:q)
        filters[:status] = filters.delete(:recall_status)
        filters[:lot_query] = filters.delete(:lot_q)
        render json: { data: InventoryWire.recall_cases(practice: current_practice, actor: current_user, **filters) }
      end
      def controlled
        return bootstrap unless params[:view] == "queue"
        render json: { data: InventoryWire.controlled_counts(practice: current_practice, actor: current_user, query: params[:q], status: params[:control_status], page: params[:page]) }
      end

      def count_sessions
        render json: { data: InventoryWire.count_sessions(practice: current_practice, actor: current_user,
          query: params[:q], status: params[:count_status], page: params[:page], session_id: params[:session_id], line_page: params[:line_page], history_page: params[:history_page]) }
      end

      def create_count_session
        input = params.require(:session).permit(:location_id, :assignee_id, :due_on, :blind, :reason, :request_key)
        record = CountProgram.create!(practice: current_practice, actor: current_user, location_id: input.require(:location_id), assignee_id: input.require(:assignee_id),
          due_on: input.require(:due_on), blind: boolean_or_default(input[:blind], field: :blind, default: true), reason: input.require(:reason), request_key: input.require(:request_key))
        render json: { acknowledged: true, id: record.id.to_s }, status: :created
      end

      def observe_session_line
        line = CountSessionLine.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
        input = params.require(:count).permit(:counted_units, :reason, :request_key)
        record = CountProgram.observe!(line: line, actor: current_user, observed: input.require(:counted_units), reason: input.require(:reason), request_key: input.require(:request_key))
        render json: { acknowledged: true, id: record.id.to_s }, status: :created
      end

      def skip_session_line
        change_session_line(:skip!)
      end

      def resume_session_line
        change_session_line(:resume!)
      end

      def reassign_count_session
        change_count_session(:reassign!)
      end

      def complete_count_session
        change_count_session(:complete!)
      end

      def cancel_count_session
        change_count_session(:cancel!)
      end

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
        input = params.require(:item).permit(:product_id, :requested_packages, :source, :destination_site_id, :reason, :request_key)
        request_key = input.require(:request_key).to_s.downcase
        validate_request_key!(request_key)
        quantity = Quantity.parse(input.require(:requested_packages), scale: 0, zero: false)
        source = input[:source].presence || "manual"
        reason = input[:reason].to_s.strip.presence
        payload = {
          product_id: input.require(:product_id).to_s,
          requested_packages: quantity.to_s("F"),
          source: source,
          destination_site_id: input[:destination_site_id].presence&.to_s,
          reason: reason
        }
        outcome = Clinic::Idempotency.execute(
          practice: current_practice,
          actor: current_user,
          operation_code: "inventory.purchase_cart_item_add",
          request_key: request_key,
          payload: payload,
          authorization: -> {
            Authorization.authorize!(actor: current_user, practice: current_practice, action: "procurement.create")
          },
          authorization_action: "procurement.create",
          result_resource: ->(item) { item },
          resource_resolver: ->(practice:, receipt:) {
            PurchaseCartItem.where(practice_id: practice.id).find_by(id: receipt.resource_id)
          }
        ) do
          cart = PurchaseCart.active_for(practice: current_practice, actor: current_user)
          saved_item = nil
          cart.with_draft_lock do
            product = current_practice.pharmacy_products.lock("FOR SHARE").find(payload.fetch(:product_id))
            cart.update!(
              destination_site: payload[:destination_site_id].present? ? cart_destination(payload[:destination_site_id]) : cart.destination_site,
              reason: reason || cart.reason
            )
            item = cart.items.find_or_initialize_by(practice_id: current_practice.id, product_id: product.id)
            raise ArgumentError, "A purchase cart supports at most 100 products." if item.new_record? && cart.items.count >= 100
            next_quantity = quantity + (item.persisted? ? item.requested_packages.to_d : 0)
            next_quantity = Quantity.parse(next_quantity.to_s("F"), scale: 0, zero: false)
            offer = PurchaseCartCheckout.select_offer(product: product, requested_packages: next_quantity)
            item.assign_attributes(requested_packages: next_quantity, input_unit: "package", conversion_factor: offer.supplier_product.package_quantity,
              selected_supplier_product: offer.supplier_product, selected_supplier: offer.supplier, selected_unit_price: offer.supplier_product.wholesale_unit_cost,
              selected_currency: offer.supplier_product.currency, selected_package_quantity: offer.supplier_product.package_quantity,
              price_snapshot_at: offer.captured_at, price_snapshot_digest: offer.digest, source: source, status: "draft")
            item.save!
            saved_item = item
          end
          saved_item
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        response = params[:response] == "ack" ? { acknowledged: true } : { data: InventoryWire.call(practice: current_practice, actor: current_user) }
        render json: response.merge(replayed: outcome.replayed), status: :created
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
        params[:response] == "ack" ? render(json: { acknowledged: true }) : bootstrap
      end

      def remove_purchase_cart_item
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "procurement.create")
        item = PurchaseCartItem.where(practice_id: current_practice.id).joins(:cart).where(clinic_inventory_purchase_carts: { actor_id: current_user.id, status: "draft" }).find(params[:id])
        item.cart.with_draft_lock { item.reload.destroy! }
        params[:response] == "ack" ? render(json: { acknowledged: true }) : bootstrap
      end

      def checkout_purchase_cart
        input = params.require(:checkout).permit(:cart_id, :request_key)
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        cart, orders = PurchaseCartCheckout.call(practice: current_practice, actor: current_user, cart_id: input.require(:cart_id), request_key: request_key)
        payload = params[:response] == "ack" ? { acknowledged: true } : { data: InventoryWire.call(practice: current_practice, actor: current_user) }
        render json: payload.merge(checkout_group_id: cart.checkout_group_id, purchase_order_ids: orders.map(&:id)), status: :created
      end

      def transition_purchase_order
        order = purchase_orders_scope.find(params[:id])
        request_key = params.require(:request_key).to_s
        validate_request_key!(request_key)
        order.transition!(to: params.require(:status), actor: current_user, reason: params.require(:reason), request_key: request_key)
        params[:response] == "ack" ? render(json: { acknowledged: true }) : bootstrap
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
            delivered_at = input[:delivered_at].present? ? Time.iso8601(input[:delivered_at].to_s) : Current.business_time
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
        payload = params[:response] == "ack" ? { acknowledged: true } : { data: InventoryWire.call(practice: current_practice, actor: current_user) }
        render json: payload.merge(id: shipment.id), status: :created
      end

      def create_receipt
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "inventory.receive")
        input = params[:receipt].presence || params
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        replay = Receipt.find_by(practice_id: current_practice.id, request_key: request_key)
        order = purchase_orders_scope.find(input.require(:purchase_order_id))
        shipment = Shipment.where(practice_id: current_practice.id, purchase_order_id: order.id).find(input.require(:shipment_id))
        line = order.lines.find(input.require(:purchase_order_line_id))
        packages = Quantity.parse(input.require(:quantity_packages).to_s, scale: 0, zero: true).to_i
        raise ArgumentError, "Provide structured discrepancy counts." unless input[:reconciliation].nil? || input[:reconciliation].is_a?(ActionController::Parameters)
        reconciliation = input[:reconciliation]&.permit(:missing_packages, :rejected_packages, :excess_packages, :exception)&.to_h
        raise ArgumentError, "Receipt quantity must be a nonnegative whole number of packages." if packages.negative?
        product = line.product
        lot = Lot.where(practice_id: current_practice.id, product_id: product.id).find_by(number: input[:lot_number].to_s.strip)
        matched_recall = if lot
          current_practice.inventory_recalls.open_cases.joins(:recall_lots)
            .find_by(product_id: product.id, clinic_inventory_recall_lots: { lot_id: lot.id })
        end
        recalled = matched_recall.present?
        destination = if packages.positive?
          if input[:destination_location_id].present?
            current_practice.inventory_locations.find(input[:destination_location_id])
          else
            matches = current_practice.inventory_locations.where(name: input.require(:destination_location)).limit(2).to_a
            raise ArgumentError, "Select an exact destination location." unless matches.one?
            matches.first
          end
        end
        if packages.positive? && recalled && destination.restricted_kind != "quarantine"
          raise ArgumentError, "Blocking recall match: this lot must be routed to a quarantine location."
        end
        recall = if recalled && packages.positive?
          Authorization.authorize!(actor: current_user, practice: current_practice, action: "recall.lock")
          current_practice.inventory_recalls.open_cases.joins(:recall_lots).find_by!(id: requested_id!(input.require(:recall_id), :recall_id), product_id: product.id, clinic_inventory_recall_lots: { lot_id: lot.id })
        elsif input[:recall_id].present? && replay
          # A retry remains safe after its recall case has closed: Receiving
          # compares the complete persisted payload before returning it.
          Authorization.authorize!(actor: current_user, practice: current_practice, action: "recall.lock")
          current_practice.inventory_recalls.joins(:recall_lots).find_by!(id: requested_id!(input.require(:recall_id), :recall_id), product_id: product.id, clinic_inventory_recall_lots: { lot_id: lot.id })
        elsif input[:recall_id].present?
          raise ArgumentError, "A recall can only be supplied for a recalled lot."
        end
        receipt = Receiving.call(practice: current_practice, actor: current_user, supplier: order.supplier&.name, invoice_reference: input[:invoice_reference], reason: input.require(:reason), request_key: request_key, purchase_order: order, shipment: shipment, recall: recall, reconciliation: reconciliation, status: recall ? "quarantined" : "received", lines: [ { product_id: product.id, lot_number: input[:lot_number], location_id: input[:destination_location_id].present? ? destination&.id : nil, location: destination&.name, expires_on: input[:expiration_date], amount: packages, input_unit: InventoryWire::PACKAGE_INPUT_UNIT, area_id: input[:area_id], temperature_c: input[:temperature_c], exception: input[:exception], disposition: input[:disposition], purchase_order_line_id: line.id } ])
        payload = params[:response] == "ack" ? { acknowledged: true } : { data: InventoryWire.call(practice: current_practice, actor: current_user) }
        render json: payload.merge(receipt_id: receipt.is_a?(Receipt) ? receipt.id : nil)
      end

      def create_transfer
        input = params[:transfer].presence || params
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        TransferStock.call(practice: current_practice, actor: current_user, source_batch_id: input.require(:source_batch_id), destination_location_id: input.require(:destination_location_id), amount: input.require(:quantity), reason: input.require(:reason), request_key: request_key)
        params[:response] == "ack" ? render(json: { acknowledged: true }) : bootstrap
      end

      def create_adjustment
        input = params[:adjustment].presence || params
        validate_request_key!(input.require(:request_key).to_s)
        batch = batch_for(input)
        delta = Quantity.parse(input.require(:delta_units), scale: batch.product.quantity_scale, signed: true)
        reason = required_adjustment_reason!(input[:reason])
        raise ArgumentError, "Adjustment cannot be zero." if delta.zero?
        movement = batch.move!(kind: delta.positive? ? "adjustment_in" : "adjustment_out", amount: delta.abs, reason: reason, actor: current_user, request_key: input[:request_key].to_s)
        batch.reload
        adjustment = {
          id: movement.id.to_s,
          delta_units: movement.quantity.to_d.to_s("F"),
          reason: movement.reason,
          product_name: batch.product.name,
          lot_number: batch.lot.number,
          location_name: batch.location_record.name,
          resulting_on_hand_units: batch.quantity.to_d.to_s("F"),
          stock_unit: batch.product.stock_unit
        }
        if params[:response] == "ack"
          render json: { acknowledged: true, adjustment: adjustment }
        else
          render json: { data: InventoryWire.call(practice: current_practice, actor: current_user), adjustment: adjustment }
        end
      end

      def create_count
        input = params[:count].presence || params
        validate_request_key!(input.require(:request_key).to_s)
        batch = batch_for(input)
        Count.observe!(batch: batch, actor: current_user, observed: input.require(:counted_units), reason: input.require(:reason), request_key: input[:request_key].to_s)
        params[:response] == "ack" ? render(json: { acknowledged: true }) : bootstrap
      end

      def approve_count
        count = Count.where(practice_id: current_practice.id).find(params[:id])
        request_key = params.require(:request_key).to_s
        validate_request_key!(request_key)
        count.approve!(actor: current_user, request_key: request_key)
        params[:response] == "ack" ? render(json: { acknowledged: true }) : bootstrap
      end

      def create_recall
        Authorization.authorize!(actor: current_user, practice: current_practice, action: "recall.lock")
        input = params.require(:recall).permit(:request_key, :batch_id, :lot_id, :location_id, :reference, :reason, :required_disposition, lot_ids: [])
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        # Preserve replay of a receipt-era single-position recall request.
        legacy = if !input.key?(:lot_ids)
          digest = Digest::SHA256.hexdigest(JSON.generate({ actor_id: current_user.id, payload: input.to_h.deep_stringify_keys.sort.to_h }))
          Recall.where(practice_id: current_practice.id, actor_id: current_user.id, request_key: request_key, payload_digest: digest).first
        end
        recall = legacy || RecallCase.create!(practice: current_practice, actor: current_user,
          lot_ids: input.key?(:lot_ids) ? input[:lot_ids] : [ batch_for(input).lot_id ],
          reference: input.require(:reference), reason: input.require(:reason), required_disposition: input[:required_disposition].presence || "return_to_supplier", request_key: request_key)
        payload = params[:response] == "ack" ? { acknowledged: true } : { data: InventoryWire.call(practice: current_practice, actor: current_user) }
        render json: payload.merge(id: recall.id.to_s), status: :created
      end

      def contain_recall
        recall = Recall.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
        input = params.require(:containment).permit(:reason, :request_key)
        RecallCase.contain!(recall: recall, actor: current_user, reason: input.require(:reason), request_key: input.require(:request_key))
        render json: { acknowledged: true, id: recall.id.to_s }
      end

      def close_recall
        recall = Recall.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
        input = params.require(:closure).permit(:reason, :evidence_reference, :request_key)
        closure = RecallCase.close!(recall: recall, actor: current_user, reason: input.require(:reason), evidence_reference: input.require(:evidence_reference), request_key: input.require(:request_key))
        render json: { acknowledged: true, id: closure.id.to_s }, status: :created
      end

      def create_disposition
        recall = Recall.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
        input = params[:disposition].presence || params
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        RecallDisposition.execute!(recall: recall, actor: current_user, batch_id: input.require(:batch_id), quantity: input.require(:quantity_units), method: input[:method].presence || "return_to_supplier", evidence_reference: input.require(:evidence_reference), reason: input.require(:reason), request_key: request_key)
        params[:response] == "ack" ? render(json: { acknowledged: true }) : bootstrap
      end

      def investigate_control
        count = Count.where(practice_id: current_practice.id).find(params[:id])
        input = params[:review].presence || params
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        ControlReview.investigate!(count: count, actor: current_user, reason: input.require(:reason), request_key: request_key)
        params[:response] == "ack" ? render(json: { acknowledged: true }) : bootstrap
      end

      def certify_control
        count = Count.where(practice_id: current_practice.id).find(params[:id])
        input = params[:review].presence || params
        request_key = input.require(:request_key).to_s
        validate_request_key!(request_key)
        ControlReview.record!(count: count, actor: current_user, kind: "certification", reason: input.require(:reason), request_key: request_key)
        params[:response] == "ack" ? render(json: { acknowledged: true }) : bootstrap
      end

      private

      def change_session_line(operation)
        line = CountSessionLine.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
        input = params.require(:event).permit(:reason, :request_key)
        CountProgram.public_send(operation, line: line, actor: current_user, reason: input.require(:reason), request_key: input.require(:request_key))
        render json: { acknowledged: true, id: line.id.to_s }
      end

      def change_count_session(operation)
        session = CountSession.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
        input = params.require(:event).permit(:assignee_id, :reason, :request_key)
        arguments = { session: session, actor: current_user, reason: input.require(:reason), request_key: input.require(:request_key) }
        arguments[:assignee_id] = input.require(:assignee_id) if operation == :reassign!
        CountProgram.public_send(operation, **arguments)
        render json: { acknowledged: true, id: session.id.to_s }
      end

      def location_attributes
        params.require(:location).permit(:name, :kind, :site_id, :parent_location_id, :status, :address_line1, :address_line2, :city, :state, :postal_code, :country).to_h
      end

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

      def required_adjustment_reason!(value)
        reason = value.to_s.strip
        raise ArgumentError, "Enter a reason for this inventory adjustment." if reason.empty?
        raise ArgumentError, "Keep the adjustment reason within 200 characters." if reason.length > 200

        reason
      end
    end
  end
end
