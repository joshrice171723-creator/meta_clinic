module Development
  class DemoSandboxInventoryReplenishment
    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      practices = run.practice.organization.practices.order(:id).to_a
      raise ArgumentError, "Inventory replenishment needs two clinics" unless practices.length == 2
      practices.each { |practice| prepare_practice!(practice:, actor: run.operator_user) }
    end

    def self.prepare_practice!(practice:, actor:)
      product = practice.pharmacy_products.find_by!(sku: "OPS-GAUZE")
      locations = practice.inventory_locations.where(name: "Operations supply").where.not(site_id: nil).order(:site_id).to_a
      raise ArgumentError, "Inventory replenishment needs two site locations" unless locations.length == 2

      locations.each do |location|
        batch = product.batches.usable(practice.inventory_date).where(location_id: location.id).order(:expires_on, :id).first!
        4.times do |week|
          batch.move!(kind: "adjustment_out", amount: 15, reason: "Additional weekly clinic supply use",
            actor:, request_key: SecureRandom.uuid,
            occurred_at: Current.business_time - (52 - week * 7).days)
        end
      end

      product.reload
      raise ArgumentError, "Synthetic gauze use did not reach its reorder point" unless product.low_stock?

      location = locations.first
      site = location.site
      raise ArgumentError, "A local reorder needs a complete site shipping address" unless site&.status == "active" && site.shipping_address?
      Clinic::Authorization.authorize!(actor:, practice:, action: "procurement.create")

      Clinic::Inventory::PurchaseOrder.transaction do
        request_key = SecureRandom.uuid
        Clinic::Inventory::Access.retry_lock(practice.id, request_key)
        price_line = product.batches.usable(practice.inventory_date).where(location_id: location.id)
          .order(:expires_on, :id).first!.receipt_lines.order(:id).last!
        price = price_line.unit_cost || raise(ArgumentError, "A local reorder needs a recorded package cost")
        currency = price_line.currency || raise(ArgumentError, "A local reorder needs a recorded currency")
        payload = [actor.id, product.id, site.id, "1", price.to_s, currency]
        order = Clinic::Inventory::PurchaseOrder.create!(
          practice:, actor:, supplier: product.preferred_supplier,
          receiving_site: site, number: "PO-SBX-#{SecureRandom.hex(6).upcase}", status: "draft",
          currency:,
          destination: site.name, destination_address: site.formatted_address,
          reason: "Gauze reorder after low-stock review; not submitted",
          request_key:, payload_digest: Digest::SHA256.hexdigest(JSON.generate(payload)),
          version: 1, subtotal: price, tax: 0, shipping: 0, total: price
        )
        order.lines.create!(
          practice:, product:, product_name: product.name, stock_unit: product.stock_unit,
          input_unit: "package", ordered_quantity: 1, ordered_package_quantity: 1, received_quantity: 0,
          conversion_factor: product.package_size, unit_price: price, currency:
        )
        order.events.create!(practice:, actor:, from_status: "new", to_status: "draft",
          reason: "Local low-stock review", request_key: "#{request_key}:event")
      end
    end
    private_class_method :prepare_practice!
  end
end
