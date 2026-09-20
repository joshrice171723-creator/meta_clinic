module Development
  # Independently fictional prerequisites only. The visitor records the receipt,
  # count and adjustment; setup must never satisfy those lesson predicates.
  class DemoInventory
    def self.prepare!(practice:, actor:)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled?

      Clinic::Inventory::Profile.revise!(practice:, actor:, status: "configured",
        reason: "Guided clinic inventory preparation")
      site = practice.sites.first!
      location = practice.inventory_locations.create!(site:, name: "Supply cabinet", kind: "storage", status: "active")
      supplier = practice.inventory_suppliers.create!(name: "Example Supply")
      product = practice.pharmacy_products.create!(name: "Exam gloves", sku: "GUIDED-GLOVES",
        category: "clinical_supply", source: "synthetic", stock_unit: "each", quantity_scale: 0,
        package_size: 100, unit_reference: "each", package_description: "Box of 100 gloves",
        reorder_point: 100, active: true, preferred_supplier: supplier)
      order = practice.inventory_purchase_orders.create!(actor:, supplier:, receiving_site: site,
        number: "GUIDED-001", status: "sent", destination: location.name,
        reason: "Fictional shipment for the guided receiving lesson", request_key: SecureRandom.uuid,
        payload_digest: "guided-receiving-v1", version: 1, subtotal: 20, tax: 0, shipping: 0, total: 20)
      line = order.lines.create!(practice:, product:, product_name: product.name, stock_unit: "each",
        input_unit: "package", ordered_quantity: 2, received_quantity: 0,
        conversion_factor: 100, unit_price: 10, currency: "USD")
      shipment = order.shipments.create!(practice:, actor:, reference: "GUIDED-SHIPMENT-001",
        supplier_reference: "EXAMPLE-001", status: "delivered", package_count: 2, expected_units: 200,
        delivered_at: Current.business_time, request_key: SecureRandom.uuid, payload_digest: "guided-shipment-v1")
      shipment.shipment_lines.create!(practice:, purchase_order_line: line, expected_packages: 2)
    end
  end
end
