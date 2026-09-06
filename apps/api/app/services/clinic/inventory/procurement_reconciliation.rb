module Clinic
  module Inventory
    class ProcurementReconciliation
      def self.record_return(practice:, actor:, order_id:, input:)
        record(practice, actor, order_id, input, VendorReturn, "inventory.adjust") do |order|
          receipt_ids = order.receipts.where(practice_id: practice.id).select(:id)
          line = ReceiptLine.where(practice_id: practice.id, receipt_id: receipt_ids).lock.find(input.fetch(:receipt_line_id))
          batch = PharmacyBatch.where(practice_id: practice.id).find(line.batch_id)
          PharmacyProduct.lock("FOR SHARE").find(batch.product_id)
          batch.location_record.lock!
          batch.lock!
          raise ArgumentError, "Use the recall disposition workflow for recalled stock." if batch.active_holds.where(kind: "recalled").exists?
          amount = Quantity.parse(input.fetch(:quantity), scale: batch.product.quantity_scale)
          returned = VendorReturn.where(practice_id: practice.id, receipt_line_id: line.id).sum(:quantity)
          raise ArgumentError, "Return exceeds this receipt's remaining units." if amount > line.quantity - returned
          entry = batch.move!(kind: "return_to_supplier", amount: amount.to_s("F"), actor: actor,
            reason: input.fetch(:reason), request_key: input.fetch(:request_key))
          purchase_line = order.lines.find(line.purchase_order_line_id)
          { receipt_line_id: line.id, entry_id: entry.id, quantity: amount,
            details: { product: batch.product.name, lot: batch.lot_number, stock_unit: batch.product.stock_unit,
              currency: purchase_line.currency, maximum_credit: (amount * purchase_line.unit_price / purchase_line.conversion_factor).round(6).to_s("F") } }
        end
      end

      def self.record_credit(practice:, actor:, order_id:, input:)
        record(practice, actor, order_id, input, SupplierCredit, "procurement.approve") do |order|
          returned = VendorReturn.where(practice_id: practice.id, purchase_order_id: order.id).lock.find(input.fetch(:vendor_return_id))
          amount = Quantity.parse(input.fetch(:amount), scale: 6)
          currency = input.fetch(:currency).to_s.upcase
          raise ArgumentError, "Credit currency must match the original order." unless currency == returned.details.fetch("currency")
          credited = SupplierCredit.where(practice_id: practice.id, vendor_return_id: returned.id).sum(:amount)
          maximum = BigDecimal(returned.details.fetch("maximum_credit"))
          raise ArgumentError, "Credit exceeds the uncredited returned merchandise value." if amount + credited > maximum
          { vendor_return_id: returned.id, amount: amount, currency: currency, details: { return_reference: returned.reference } }
        end
      end

      def self.record_invoice(practice:, actor:, order_id:, input:)
        record(practice, actor, order_id, input, SupplierInvoice, "procurement.approve") do |order|
          prior = SupplierInvoice.where(practice_id: practice.id, purchase_order_id: order.id, reference: input.fetch(:reference).to_s.strip).order(:id).last
          if prior
            raise ArgumentError, "This invoice is already matched." if prior.status == "matched"
            raise ArgumentError, "Reload the latest invoice discrepancy before correcting it." unless input[:supersedes_id].to_s == prior.id.to_s
          elsif input[:supersedes_id].present?
            raise ArgumentError, "The original invoice was not found for this order."
          end
          rows = input.fetch(:lines)
          raise ArgumentError, "An invoice needs 1–100 distinct order lines." unless rows.is_a?(Array) && rows.size.between?(1, 100) && rows.map { |r| r[:purchase_order_line_id].to_s }.uniq.size == rows.size
          currency = input.fetch(:currency).to_s.upcase
          raise ArgumentError, "Currency must contain three letters." unless currency.match?(/\A[A-Z]{3}\z/)
          discrepancies = []
          matched = SupplierInvoice.where(practice_id: practice.id, purchase_order_id: order.id, status: "matched").to_a
          subtotal = BigDecimal("0")
          snapshots = rows.map do |values|
            row = values.with_indifferent_access
            line = order.lines.where(practice_id: practice.id).find(row.fetch(:purchase_order_line_id))
            packages = Quantity.parse(row.fetch(:quantity_packages), scale: 0)
            price = Quantity.parse(row.fetch(:unit_price), scale: 6, zero: true)
            used = matched.sum(BigDecimal("0")) { |invoice| invoice.details.fetch("lines").select { |r| r.fetch("purchase_order_line_id") == line.id.to_s }.sum(BigDecimal("0")) { |r| BigDecimal(r.fetch("quantity_packages")) } }
            discrepancies << "#{line.product_name}: invoiced packages exceed unmatched accepted receipts" if packages + used > line.received_quantity
            discrepancies << "#{line.product_name}: unit price differs from purchase order" if price != line.unit_price
            discrepancies << "#{line.product_name}: currency differs from purchase order" if currency != line.currency
            subtotal += packages * price
            { purchase_order_line_id: line.id.to_s, product: line.product_name, quantity_packages: packages.to_s("F"), unit_price: price.to_s("F") }
          end
          tax = Quantity.parse(input[:tax] || "0", scale: 6, zero: true)
          shipping = Quantity.parse(input[:shipping] || "0", scale: 6, zero: true)
          amount = Quantity.parse(input.fetch(:amount), scale: 6, zero: true)
          discrepancies << "Invoice total does not equal lines, tax and shipping" if amount != subtotal + tax + shipping
          discrepancies << "Tax exceeds remaining approved order tax" if tax + matched.sum(BigDecimal("0")) { |r| BigDecimal(r.details.fetch("tax")) } > order.tax
          discrepancies << "Shipping exceeds remaining approved order shipping" if shipping + matched.sum(BigDecimal("0")) { |r| BigDecimal(r.details.fetch("shipping")) } > order.shipping
          { amount: amount, currency: currency, status: discrepancies.empty? ? "matched" : "discrepancy", supersedes_id: prior&.id,
            details: { lines: snapshots, tax: tax.to_s("F"), shipping: shipping.to_s("F"), discrepancies: discrepancies } }
        end
      end

      def self.record(practice, actor, order_id, input, model, permission)
        model.transaction do
          practice = Clinic::Practice.lock("FOR SHARE").find(practice.id)
          actor = User.lock("FOR SHARE").find(actor.id)
          Authorization.authorize!(actor: actor, practice: practice, action: permission)
          Access.retry_lock(practice.id, input.fetch(:request_key))
          order = PurchaseOrder.where(practice_id: practice.id).lock.find(order_id)
          raise ArgumentError, "An identified supplier is required for reconciliation." unless order.supplier_id
          digest = Digest::SHA256.hexdigest(JSON.generate([actor.id, order.id.to_s, input.deep_stringify_keys]))
          existing = model.find_by(practice_id: practice.id, request_key: input.fetch(:request_key))
          if existing
            raise ArgumentError, "This form was already used for different data." unless existing.payload_digest == digest
            return existing
          end
          attributes = yield(order)
          model.create!(attributes.merge(practice: practice, actor: actor, purchase_order: order,
            reference: input.fetch(:reference).to_s.strip, reason: input.fetch(:reason).to_s.strip,
            request_key: input.fetch(:request_key), payload_digest: digest))
        end
      end
      private_class_method :record
    end
  end
end
