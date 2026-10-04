module Clinic
  module Inventory
    # Shared draft creation from ManagementController; does not submit or purchase.
    class DraftPurchaseOrder
      def self.call(practice:, actor:, attributes:)
        Authorization.authorize!(actor:, practice:, action: "procurement.create")
        input = attributes.to_h.with_indifferent_access
        request_key = input.fetch(:request_key).to_s
        payload_digest = Digest::SHA256.hexdigest(JSON.generate({ actor_id: actor.id, payload: input.to_h.deep_stringify_keys.sort.to_h }))
        order = PurchaseOrder.transaction do
          Access.retry_lock(practice.id, request_key)
          existing = practice.inventory_purchase_orders.find_by(request_key: request_key)
          if existing
            raise ArgumentError, "This purchase-order form was already used for different data." unless existing.payload_digest == payload_digest
            existing
          else
            rows = Array(input[:lines])
            raise ArgumentError, "A purchase order needs 1–100 lines." unless rows.size.between?(1, 100)
            supplier = input[:supplier_id].present? ? practice.inventory_suppliers.find(input[:supplier_id]) : nil
            receiving_site = if input[:receiving_site_id].present?
              practice.sites.find(input[:receiving_site_id])
            end
            if receiving_site
              raise ArgumentError, "The selected facility must be active before it can receive a purchase order." unless receiving_site.status == "active"
              raise ArgumentError, "The selected facility needs a complete shipping address." unless receiving_site.shipping_address?
            end
            destination_location = if input[:destination_location_id].present? && receiving_site.nil?
              practice.inventory_locations.find(input[:destination_location_id])
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
            order = practice.inventory_purchase_orders.create!(actor: actor, supplier: supplier, receiving_site: receiving_site, number: input[:number].presence || "PO-#{SecureRandom.hex(12)}", status: "draft", destination: destination, destination_address: destination_address, reason: input.fetch(:reason), request_key: request_key, payload_digest: payload_digest, version: 1, tax: input[:tax].presence || 0, shipping: input[:shipping].presence || 0)
            products = practice.pharmacy_products.where(id: rows.map { |row| row[:product_id] }).index_by { |product| product.id.to_s }
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
              currency = row.fetch(:currency).to_s.upcase
              raise ArgumentError, "Currency must be a three-letter ISO code." unless currency.match?(/\A[A-Z]{3}\z/)
              offer = if row[:supplier_product_id].present?
                SupplierProduct.where(practice_id: practice.id).lock.find(row[:supplier_product_id])
              end
              if offer
                raise ArgumentError, "The supplier quote no longer matches this draft. Review the price before retrying." unless
                  supplier && offer.supplier_id == supplier.id && offer.product_id == product.id &&
                  offer.purchase_eligibility_reason(on: practice.inventory_date).nil? &&
                  offer.package_quantity == factor && offer.wholesale_unit_cost == price && offer.currency == currency &&
                  offer.updated_at.iso8601(6) == row[:supplier_product_updated_at].to_s
              end
              if order_currency && order_currency != currency
                raise ArgumentError, "A purchase order cannot contain multiple currencies."
              end
              order_currency ||= currency
              subtotal += quantity * price
              order.lines.create!(practice_id: practice.id, product: product, product_name: product.name, stock_unit: product.stock_unit, input_unit: input_unit, ordered_quantity: quantity, received_quantity: 0, conversion_factor: factor, unit_price: price, currency: currency,
                supplier_product: offer, supplier_sku: offer&.supplier_sku, price_snapshot_at: offer && Time.current,
                price_snapshot_digest: offer && Digest::SHA256.hexdigest([ offer.id, offer.wholesale_unit_cost.to_s("F"), offer.currency, offer.quote_reference, offer.quoted_on&.iso8601, offer.quoted_fee_amount&.to_s("F"), offer.quoted_fee_currency, offer.quoted_fee_basis ].join("|")),
                quote_reference: offer&.quote_reference, quoted_on: offer&.quoted_on,
                quoted_fee_amount: offer&.quoted_fee_amount, quoted_fee_currency: offer&.quoted_fee_currency,
                quoted_fee_basis: offer&.quoted_fee_basis)
            end
            order.update!(subtotal: subtotal, total: subtotal + order.tax + order.shipping)
            order
          end
        end
        order
      end
    end
  end
end
