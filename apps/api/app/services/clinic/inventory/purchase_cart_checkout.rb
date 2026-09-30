module Clinic
  module Inventory
    class PurchaseCartCheckout
      Offer = Struct.new(:supplier_product, :supplier, :supplier_packages, :desired_units, :overage_units, :normalized_cost, :total_cost, :digest, :captured_at, keyword_init: true)
      class OfferChanged < ArgumentError; end

      def self.select_offer(product:, requested_packages:)
        raise ArgumentError, "Inactive products cannot be purchased." unless product.active?
        requested_packages = Quantity.parse(requested_packages.is_a?(BigDecimal) ? requested_packages.to_s("F") : requested_packages.to_s, scale: 0, zero: false)
        offers = SupplierProduct.where(practice_id: product.practice_id, product_id: product.id)
          .eligible_for_purchase(on: product.practice.inventory_date)
          .includes(:supplier)
          .order(:id).lock("FOR SHARE")
          .to_a
        raise ArgumentError, "No eligible supplier offer is available for #{product.name}." if offers.empty?

        desired_units = requested_packages.to_d * product.package_size.to_d
        candidates = offers.filter_map do |candidate|
          supplier_packages = (desired_units / candidate.package_quantity.to_d).ceil
          next unless supplier_packages.between?(1, 1_000_000)

          normalized_cost = candidate.wholesale_unit_cost.to_d / candidate.package_quantity.to_d
          total_cost = supplier_packages * candidate.wholesale_unit_cost.to_d
          overage_units = supplier_packages * candidate.package_quantity.to_d - desired_units
          preferred = product.preferred_supplier_id.to_i == candidate.supplier_id.to_i ? 0 : 1
          [ candidate, supplier_packages, normalized_cost, total_cost, overage_units, preferred ]
        end
        if candidates.empty?
          raise ArgumentError, "No eligible supplier offer can fulfill the requested quantity within the supported package limit for #{product.name}."
        end
        currencies = candidates.map { |candidate,| candidate.currency }.uniq
        if currencies.size > 1
          raise ArgumentError, "Eligible supplier offers for #{product.name} use multiple currencies. Currency conversion is not supported."
        end

        offer, supplier_packages, normalized_cost, total_cost, overage_units, = candidates.min_by do |candidate, packages, normalized, total, overage, preferred|
          [ total, overage, normalized, candidate.lead_time_days || 1_000_000, preferred, candidate.id ]
        end
        Quantity.parse(supplier_packages.to_s, scale: 0, zero: false)
        captured_at = Time.current
        payload = [ offer.id, offer.supplier_id, offer.wholesale_unit_cost.to_d.to_s("F"), offer.currency, offer.package_quantity.to_d.to_s("F"), offer.effective_date&.iso8601,
          offer.supplier_sku, offer.ordering_unit, offer.contract_status, offer.available?, offer.lead_time_days,
          offer.price_source, offer.quote_reference, offer.quoted_on&.iso8601,
          offer.quoted_fee_amount&.to_d&.to_s("F"), offer.quoted_fee_currency, offer.quoted_fee_basis,
          product.package_size.to_d.to_s("F"), product.stock_unit, desired_units.to_s("F"), supplier_packages,
          overage_units.to_s("F"), normalized_cost.to_s("F"), total_cost.to_s("F") ]
        Offer.new(supplier_product: offer, supplier: offer.supplier, supplier_packages: supplier_packages,
          desired_units: desired_units, overage_units: overage_units, normalized_cost: normalized_cost, total_cost: total_cost,
          digest: Digest::SHA256.hexdigest(payload.join("|")), captured_at: captured_at)
      end

      def self.call(practice:, actor:, cart_id:, request_key:)
        Authorization.authorize!(actor: actor, practice: practice, action: "procurement.create")
        request_key = request_key.to_s.downcase
        raise ArgumentError, "A valid checkout idempotency key is required." unless request_key.match?(/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/)
        PurchaseOrder.transaction do
          practice = Clinic::Practice.lock("FOR SHARE").find(practice.id)
          actor = User.lock("FOR SHARE").find(actor.id)
          Access.retry_lock(practice.id, request_key)
          cart = PurchaseCart.where(practice_id: practice.id, actor_id: actor.id).lock.find(cart_id)
          Authorization.authorize!(actor: actor, practice: practice, action: "procurement.create")
          if PurchaseCart.where(practice_id: practice.id, request_key: request_key).where.not(id: cart.id).exists?
            raise ArgumentError, "This checkout key was already used for another cart."
          end
          existing = PurchaseOrder.where(practice_id: practice.id, checkout_group_id: cart.checkout_group_id).order(:id).to_a if cart.checkout_group_id.present?
          if cart.status == "checked_out" && existing.present?
            raise ArgumentError, "This cart was checked out with a different retry key." unless cart.request_key == request_key
            return [ cart, existing ]
          end
          raise ArgumentError, "This cart is not ready for checkout." unless cart.status == "draft"
          raise ArgumentError, "Add at least one item before checking out." if cart.items.where(status: "draft").empty?
          site = practice.sites.lock("FOR SHARE").find_by(id: cart.destination_site_id)
          raise ArgumentError, "An active destination facility with a complete shipping address is required." unless site&.status == "active" && site.shipping_address?
          raise ArgumentError, "A reason is required before checkout." if cart.reason.blank?

          cart.update!(status: "checking_out", request_key: request_key, version: cart.version + 1)
          items = cart.items.where(status: "draft").order(:id).to_a
          raise ArgumentError, "A purchase cart supports at most 100 products." if items.size > 100
          products = PharmacyProduct.where(practice_id: practice.id, id: items.map(&:product_id)).order(:id).lock("FOR SHARE").index_by(&:id)
          offers = items.map do |item|
            item.product = products.fetch(item.product_id)
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
              actor: actor, supplier: supplier, receiving_site: site, purchase_cart: cart,
              checkout_group_id: checkout_group_id, source_kind: "purchase_cart", currency: currencies.first,
              number: "PO-#{SecureRandom.hex(8)}", status: "draft", destination: site.name,
              destination_address: site.formatted_address, reason: cart.reason, request_key: order_key,
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
                price_snapshot_at: offer.captured_at, price_snapshot_digest: offer.digest,
                quote_reference: supplier_product.quote_reference, quoted_on: supplier_product.quoted_on,
                quoted_fee_amount: supplier_product.quoted_fee_amount, quoted_fee_currency: supplier_product.quoted_fee_currency,
                quoted_fee_basis: supplier_product.quoted_fee_basis
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
        end
      end
    end
  end
end
