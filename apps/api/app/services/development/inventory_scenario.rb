module Development
  class InventoryScenario
    PRODUCT_FIXTURES = [
      { key: "acetaminophen", name: "Acetaminophen 500 mg Tablet", sku: "SYN-ACET-500", ndc: "00063-0876-21", generic_name: "Acetaminophen", dea_schedule: nil, reorder_point: 500, lot: "250701B", expires_on: Date.new(2027, 7, 31), location: "Main Pharmacy", location_kind: "storage", opening: 600, supplier: "MedSupply Co." },
      { key: "dextroamphetamine", name: "Dextroamphetamine-Amphetamine 10 mg Tablet", sku: "SYN-DEX-010", ndc: "00555-0134-02", generic_name: "Dextroamphetamine-Amphetamine", dea_schedule: "II", reorder_point: 200, lot: "260701C", expires_on: Date.new(2028, 7, 31), location: "Controlled Cabinet", location_kind: "controlled", opening: 300, supplier: "ControlledRx Distribution" }
    ].freeze

    def self.populate!(practice:, actor:)
      raise "Fictional inventory is only available in development and test." unless Rails.env.development? || Rails.env.test?

      Clinic::Practice.transaction do
        practice.lock!
        PRODUCT_FIXTURES.map { |fixture| fixture[:supplier] }.uniq.each do |name|
          Clinic::Inventory::Supplier.create_or_find_by!(practice_id: practice.id, name: name)
        end
        supplier = Clinic::Inventory::Supplier.find_by!(practice_id: practice.id, name: "MedSupply Co.")
        products = PRODUCT_FIXTURES.to_h do |fixture|
          product = practice.pharmacy_products.find_or_initialize_by(sku: fixture[:sku])
          attributes = { name: fixture[:name], generic_name: fixture[:generic_name], ndc: fixture[:ndc], dosage_form: "Tablet", route: "Oral", labeler: "Reference manufacturer", ingredients: fixture[:generic_name], package_description: "Bottle of 100 tablets", source: "synthetic", reorder_point: fixture[:reorder_point], active: true, stock_unit: "tablet", quantity_scale: 0, package_size: 100, unit_reference: "tablet", dea_schedule: fixture[:dea_schedule] }
          if product.new_record?
            product.update!(attributes)
          elsif attributes.any? { |name, value| product.public_send(name) != value }
            product.update_catalog!(attributes, actor: actor)
          end
          [ fixture[:key], product ]
        end
        PRODUCT_FIXTURES.each do |fixture|
          location = Clinic::Inventory::Location.find_or_initialize_by(practice_id: practice.id, name: fixture[:location])
          location.update!(kind: fixture[:location_kind])
        end
        { "Quarantine" => "quarantine", "Returns Holding" => "returns" }.each do |name, kind|
          location = Clinic::Inventory::Location.find_or_initialize_by(practice_id: practice.id, name: name)
          location.update!(kind: kind)
        end
        return if Clinic::Inventory::PurchaseOrder.exists?(practice_id: practice.id, number: "PO-2026-000345")

        PRODUCT_FIXTURES.each do |fixture|
          product = products.fetch(fixture[:key])
          next if product.batches.exists?(lot_number: fixture[:lot], location: fixture[:location])

          Clinic::Inventory::Receiving.call(practice: practice, actor: actor, supplier: fixture[:supplier], reason: "Synthetic opening balance imported from canonical inventory fixture", request_key: SecureRandom.uuid, lines: [ { product_id: product.id, lot_number: fixture[:lot], location: fixture[:location], expires_on: fixture[:expires_on].iso8601, amount: fixture[:opening], input_unit: "tablet" } ])
        end

        recalled_product = products.fetch("acetaminophen")
        order = Clinic::Inventory::PurchaseOrder.create!(practice_id: practice.id, actor: actor, supplier: supplier, number: "PO-2026-000345", status: "partially_received", destination: "Main Pharmacy", reason: "Synthetic canonical partial replenishment", request_key: SecureRandom.uuid, payload_digest: "canonical-po-2026-000345", version: 1, subtotal: 108, tax: 0, shipping: 12, total: 120)
        line = order.lines.create!(practice_id: practice.id, product: recalled_product, product_name: recalled_product.name, stock_unit: "tablet", input_unit: "package", ordered_quantity: 45, received_quantity: 0, conversion_factor: 100, unit_price: 2.4, currency: "USD")
        shipment = order.shipments.create!(practice_id: practice.id, actor: actor, reference: "ship-2026-000345-1", supplier_reference: "MS-88421", status: "delivered", package_count: 40, expected_units: 4000, delivered_at: Time.zone.parse("2026-08-29T10:00:00-05:00"), request_key: SecureRandom.uuid, payload_digest: "canonical-shipment-2026-000345-1")
        shipment.shipment_lines.create!(practice_id: practice.id, purchase_order_line: line, expected_packages: 40)
        recalled_lot = Clinic::Inventory::Lot.find_or_create_by!(practice_id: practice.id, product_id: recalled_product.id, number: "250601A") { |record| record.expires_on = Date.new(2027, 6, 30) }
        recall = Clinic::Inventory::Recall.create!(practice_id: practice.id, product: recalled_product, actor: actor, reference: "FDA-ACET-2026-08", status: "disposition_pending", reason: "Manufacturer quality recall", required_disposition: "return_to_supplier", effective_on: Date.new(2026, 8, 31), affected_units: 4000, request_key: SecureRandom.uuid, payload_digest: "canonical-fda-acet-2026-08")
        Clinic::Inventory::RecallLot.create!(practice_id: practice.id, recall: recall, lot: recalled_lot)
        recalled_receipt = Clinic::Inventory::Receiving.call(practice: practice, actor: actor, supplier: supplier.name, purchase_order: order, shipment: shipment, recall: recall, reason: "Synthetic partial shipment matched to manufacturer recall", request_key: SecureRandom.uuid, status: "quarantined", lines: [ { product_id: recalled_product.id, lot_number: "250601A", location: "Quarantine", expires_on: "2027-06-30", amount: 40, input_unit: "package", area_id: "quarantine_bin_1", temperature_c: "20.1", exception: "recall_match", disposition: "quarantine_recall", purchase_order_line_id: line.id } ])
        recalled_batch = recalled_product.batches.find_by!(lot_number: "250601A", location: "Quarantine")
        line.update!(received_quantity: 40)
        order.events.create!(practice_id: practice.id, actor: actor, from_status: "sent", to_status: "partially_received", reason: "Canonical shipment partially received into quarantine", request_key: SecureRandom.uuid)

        controlled = products.fetch("dextroamphetamine").batches.find_by!(lot_number: "260701C", location: "Controlled Cabinet")
        Clinic::Inventory::Count.observe!(batch: controlled, actor: actor, observed: 299, reason: "Synthetic controlled-substance cycle count", request_key: SecureRandom.uuid)
        Clinic::AuditRecorder.record!(practice: practice, actor: actor, action_code: "inventory.demo_loaded", outcome: :committed)
      end
      true
    end
  end
end
