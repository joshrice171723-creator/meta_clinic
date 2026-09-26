module Development
  class DemoSandboxInventoryHistory
    PRODUCTS = [
      { name: "Nitrile exam gloves", sku: "OPS-GLOVES", package_size: 100, initial: 4, refill: 3 },
      { name: "Alcohol prep pads", sku: "OPS-PREP", package_size: 100, initial: 3, refill: 2 },
      { name: "Sterile gauze pads", sku: "OPS-GAUZE", package_size: 50, initial: 3, refill: 2 },
      { name: "Specimen collection tubes", sku: "OPS-TUBES", package_size: 50, initial: 2, refill: 2 },
      { name: "Sharps containers", sku: "OPS-SHARPS", package_size: 10, initial: 2, refill: 1 }
    ].freeze

    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      practices = run.practice.organization.practices.order(:id).to_a
      raise ArgumentError, "Inventory history needs two sandbox clinics" unless practices.length == 2

      practices.each do |practice|
        supplier = practice.inventory_suppliers.find_or_create_by!(name: "Regional Clinic Supply")
        products = PRODUCTS.map do |fixture|
          practice.pharmacy_products.create!(
            name: fixture.fetch(:name), sku: fixture.fetch(:sku), category: "clinical_supply",
            source: "synthetic", stock_unit: "each", quantity_scale: 0,
            package_size: fixture.fetch(:package_size), unit_reference: "each",
            package_description: "Case of #{fixture.fetch(:package_size)}",
            reorder_point: fixture.fetch(:package_size), active: true, preferred_supplier: supplier
          )
        end

        practice.sites.order(:id).each_with_index do |site, site_index|
          location = practice.inventory_locations.create!(
            site:, name: "Operations supply", kind: "storage", status: "active"
          )
          [ [ "initial", Current.business_time - 58.days ],
            [ "replenishment", Current.business_time - 20.days ] ].each do |wave, received_at|
            lines = products.each_with_index.map do |product, index|
              fixture = PRODUCTS.fetch(index)
              { product_id: product.id, location_id: location.id,
                lot_number: "OPS-#{site_index + 1}-#{index + 1}-#{wave}",
                expires_on: (Current.business_time.to_date + 2.years).iso8601,
                amount: fixture.fetch(wave == "initial" ? :initial : :refill), input_unit: "package",
                unit_cost: 10 + index * 2, currency: "USD" }
            end
            Clinic::Inventory::Receiving.call(
              practice:, actor: run.operator_user, lines:, supplier: supplier.name,
              invoice_reference: "OPS-#{practice.id}-#{site.id}-#{wave}",
              reason: "Clinic supply #{wave}",
              request_key: SecureRandom.uuid,
              received_at:
            )
          end
        end
      end
    end
  end
end
