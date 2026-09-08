module Clinic
  module Inventory
    # Explicit wire contract: no unrestricted Active Record serialization.
    # Decimal quantities stay strings; the browser never computes availability.
    module ProductResponse
      def self.product(record)
        record.as_json(only: %i[id name category sku ndc product_ndc generic_name ingredients dosage_form route labeler package_description source imported_at reorder_point active stock_unit quantity_scale unit_reference])
          .merge(package_size: record.package_size.to_s("F"), available_quantity: record.available_quantity.to_d.to_s("F"),
            on_hand_quantity: record.on_hand_quantity.to_d.to_s("F"), low_stock: record.low_stock?,
            locations: record.has_attribute?(:stock_locations) ? record[:stock_locations] : [],
            next_expiry: record.has_attribute?(:next_expiry) ? record[:next_expiry] : nil)
      end

      def self.batch(record)
        record.as_json(only: %i[id product_id lot_number location expires_on])
          .merge(quantity: record.quantity.to_s("F"), available: record.available?, status: record.display_status,
            expiring: record.expiring?, product_name: record.product.name, stock_unit: record.product.stock_unit)
      end

      def self.event(record)
        record.as_json(only: %i[id actor_id created_at reason])
          .merge(kind: record.is_a?(PharmacyMovement) ? record.kind : "#{record.from_status} → #{record.to_status}",
            quantity: record.is_a?(PharmacyMovement) ? record.quantity.to_s("F") : nil)
      end

      def self.call(details)
        { product: product(details.product), batch_page: details.batch_page, batch_count: details.batch_count,
          timezone: details.product.practice.timezone,
          batches: details.batches.map { |record|
            batch(record).merge(
              holds: record.active_holds.as_json(only: %i[id kind reason]),
              counts: details.counts.fetch(record.id).map { |count|
                { id: count.id, expected_quantity: count.expected_quantity.to_s("F"), observed_quantity: count.observed_quantity.to_s("F"),
                  reason: count.reason, approved_by: count.approval&.actor_id }
              },
              receipts: details.receipt_lines.fetch(record.id).map { |line|
                { id: line.id, received_at: line.receipt.received_at, input_quantity: line.input_quantity.to_s("F"), input_unit: line.input_unit,
                  conversion_factor: line.conversion_factor.to_s("F"), quantity: line.quantity.to_s("F"), stock_unit: line.stock_unit,
                  supplier: line.receipt.supplier&.name, unit_cost: line.unit_cost&.to_s("F"), currency: line.currency, invoice_reference: line.receipt.invoice_reference }
              }, histories: details.histories.fetch(record.id).map { |entry| event(entry) })
          } }
      end
    end
  end
end
