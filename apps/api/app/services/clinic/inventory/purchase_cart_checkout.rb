module Clinic
  module Inventory
    class PurchaseCartCheckout
      Offer = Struct.new(:supplier_product, :supplier, :supplier_packages, :normalized_cost, :digest, :captured_at, keyword_init: true)
      class OfferChanged < ArgumentError; end

      def self.select_offer(product:, requested_packages:)
        offers = SupplierProduct.where(practice_id: product.practice_id, product_id: product.id, available: [ true, nil ])
          .where("effective_date IS NULL OR effective_date <= ?", Date.current)
          .includes(:supplier)
          .to_a
          .select { |offer| offer.ordering_unit.present? && offer.package_quantity.to_d.positive? }
        raise ArgumentError, "No eligible supplier offer is available for #{product.name}." if offers.empty?

        desired_units = requested_packages.to_d * product.package_size.to_d
        offer = offers.min_by do |candidate|
          normalized = candidate.wholesale_unit_cost.to_d / candidate.package_quantity.to_d
          preferred = product.preferred_supplier_id.to_i == candidate.supplier_id.to_i ? 0 : 1
          [ normalized, candidate.lead_time_days || 1_000_000, preferred, candidate.id ]
        end
        supplier_packages = (desired_units / offer.package_quantity.to_d).ceil
        captured_at = Time.current
        payload = [ offer.id, offer.supplier_id, offer.wholesale_unit_cost.to_d.to_s("F"), offer.currency, offer.package_quantity.to_d.to_s("F"), offer.effective_date&.iso8601 ]
        Offer.new(supplier_product: offer, supplier: offer.supplier, supplier_packages: supplier_packages, normalized_cost: offer.wholesale_unit_cost.to_d / offer.package_quantity.to_d, digest: Digest::SHA256.hexdigest(payload.join("|")), captured_at: captured_at)
      end

      def self.call(practice:, actor:, cart_id:, request_key:)
        Authorization.authorize!(actor: actor, practice: practice, action: "procurement.create")
        PurchaseOrder.transaction do
          Access.retry_lock(practice.id, request_key)
          cart = PurchaseCart.where(practice_id: practice.id, actor_id: actor.id).lock.find(cart_id)
          existing = PurchaseOrder.where(practice_id: practice.id, checkout_group_id: cart.checkout_group_id).order(:id).to_a if cart.checkout_group_id.present?
          return [ cart, existing ] if cart.status == "checked_out" && existing.present?
          raise ArgumentError, "This cart is not ready for checkout." unless cart.status == "draft"
          raise ArgumentError, "Add at least one item before checking out." if cart.items.where(status: "draft").empty?
          raise ArgumentError, "A destination facility is required." unless cart.destination_site&.status == "active" && cart.destination_site.shipping_address?
          raise ArgumentError, "A reason is required before checkout." if cart.reason.blank?

          cart.update!(status: "checking_out", request_key: request_key, version: cart.version + 1)
          offers = cart.items.where(status: "draft").includes(:product).map do |item|
            offer = select_offer(product: item.product, requested_packages: item.requested_packages)
            if item.selected_supplier_product_id != offer.supplier_product.id || item.price_snapshot_digest != offer.digest
              raise OfferChanged, "Supplier pricing changed for #{item.product.name}. Review the cart before checkout."
            end
            [ item, offer ]
          end
          currencies = offers.map { |_item, offer| offer.supplier_product.currency }.uniq
          raise ArgumentError, "Mixed currencies cannot be checked out together." if currencies.size > 1

          checkout_group_id = SecureRandom.uuid
          orders = offers.group_by { |_item, offer| offer.supplier_product.supplier_id }.map do |supplier_id, rows|
            supplier = rows.first.last.supplier
            order_key = "#{request_key}:#{supplier_id}"
            order = practice.inventory_purchase_orders.create!(
              actor: actor, supplier: supplier, receiving_site: cart.destination_site, purchase_cart: cart,
              checkout_group_id: checkout_group_id, source_kind: "purchase_cart", currency: currencies.first,
              number: "PO-#{SecureRandom.hex(8)}", status: "draft", destination: cart.destination_site.name,
              destination_address: cart.destination_site.formatted_address, reason: cart.reason, request_key: order_key,
              payload_digest: Digest::SHA256.hexdigest(order_key), version: 1, tax: 0, shipping: 0
            )
            subtotal = BigDecimal("0")
            rows.each do |item, offer|
              supplier_product = offer.supplier_product
              line = order.lines.create!(
                practice_id: practice.id, product: item.product, product_name: item.product.name, stock_unit: item.product.stock_unit,
                input_unit: item.input_unit, ordered_quantity: offer.supplier_packages, ordered_package_quantity: offer.supplier_packages,
                received_quantity: 0, conversion_factor: supplier_product.package_quantity, unit_price: supplier_product.wholesale_unit_cost,
                currency: supplier_product.currency, cart_item: item, supplier_product: supplier_product, supplier_sku: supplier_product.supplier_sku,
                price_snapshot_at: offer.captured_at, price_snapshot_digest: offer.digest
              )
              item.update!(status: "checked_out", purchase_order_line: line)
              subtotal += offer.supplier_packages * supplier_product.wholesale_unit_cost.to_d
            end
            order.update!(subtotal: subtotal, total: subtotal)
            order.events.create!(practice_id: practice.id, actor: actor, from_status: "new", to_status: "draft", reason: "Created from purchase cart", request_key: "#{order_key}:event")
            order
          end
          cart.update!(status: "checked_out", checkout_group_id: checkout_group_id, version: cart.version + 1)
          [ cart, orders ]
        rescue OfferChanged
          cart.update!(status: "draft", version: cart.version + 1) if cart&.persisted?
          raise
        rescue StandardError
          cart.update!(status: "draft", version: cart.version + 1) if cart&.persisted?
          raise
        end
      end
    end
  end
end
