module Clinic
  module Inventory
    module InventoryWire
      module_function
      PACKAGE_INPUT_UNIT = "package".freeze

      def call(practice:, actor:)
        products = PharmacyProduct.where(practice_id: practice.id).includes(:preferred_supplier).order(:name, :id).to_a
        batches = PharmacyBatch.where(practice_id: practice.id).includes(
          :product,
          { lot: :product },
          :location_record,
          { receipt_lines: { receipt: :supplier } },
          { movements: { receipt_line: :receipt } }
        ).order(:expires_on, :id).to_a
        active_holds_by_batch = Hold.active.where(practice_id: practice.id, batch_id: batches.map(&:id)).to_a.group_by(&:batch_id)
        batches_by_lot = batches.group_by(&:lot_id)
        inventory_date = practice.inventory_date
        lots = batches.map(&:lot).compact.uniq(&:id)
        locations = practice.inventory_locations.order(:name, :id).to_a
        recalls = Recall.where(practice_id: practice.id).includes(
          :product,
          :dispositions,
          { recall_lots: :lot }
        ).order(id: :desc).to_a
        counts = Count.where(practice_id: practice.id).includes(:approval, batch: :product).order(id: :desc).to_a
        orders = PurchaseOrder.where(practice_id: practice.id).includes(
          :supplier,
          :receipts,
          { lines: :product },
          { shipments: [ :receipts, :shipment_lines, :reconciliation ] }
        ).order(id: :desc).limit(100).to_a
        receipts = Receipt.where(practice_id: practice.id).includes(
          :actor,
          :supplier,
          :shipment,
          :purchase_order,
          { lines: { batch: [ :lot, :location_record ] } }
        ).order(id: :desc).limit(100).to_a
        suppliers = Supplier.where(practice_id: practice.id).order(:name, :id).to_a
        sites = practice.sites.order(:name, :code, :id).to_a
        supplier_products = SupplierProduct.where(practice_id: practice.id).includes(:supplier).order(:ndc, :supplier_sku, :id).to_a
        cart = PurchaseCart.where(practice_id: practice.id, actor_id: actor.id, status: "draft").includes(items: [ :product, :selected_supplier, :selected_supplier_product ]).first
        area_by_location = ReceiptLine.where(practice_id: practice.id, batch_id: batches.map(&:id)).where.not(area_id: nil).includes(batch: :location_record).to_a.group_by { |line| line.batch.location_id }.transform_values { |lines| lines.map(&:area_id).compact.uniq }
        movements = PharmacyMovement.where(practice_id: practice.id).includes(
          { batch: %i[product lot location_record] },
          { receipt_line: :receipt }
        ).order(id: :desc).limit(200).to_a
        context(practice: practice, actor: actor).merge(
          products: products.map { |product| product_wire(product, batches, active_holds_by_batch, inventory_date) },
          packages: products.map { |product| package_wire(product) },
          suppliers: suppliers.map { |supplier| { id: supplier.id.to_s, name: supplier.name } },
          sites: sites.map { |site| Clinic::FacilitySerializer.site(site) },
          supplier_products: supplier_products.map { |row| { id: row.id.to_s, supplier_id: row.supplier_id.to_s, supplier_name: row.supplier.name, product_id: row.product_id&.to_s, ndc: row.ndc, supplier_sku: row.supplier_sku, description: row.description, package_quantity: row.package_quantity.to_d.to_s("F"), wholesale_unit_cost: row.wholesale_unit_cost.to_d.to_s("F"), currency: row.currency, ordering_unit: row.ordering_unit, contract_status: row.contract_status, available: row.available, lead_time_days: row.lead_time_days, effective_date: row.effective_date&.iso8601, imported_at: row.imported_at.iso8601 } },
          locations: locations.map { |location| { id: location.id.to_s, name: location.name, kind: location.kind, address_line1: location.address_line1, address_line2: location.address_line2, city: location.city, state: location.state, postal_code: location.postal_code, country: location.country, areas: area_by_location.fetch(location.id, []) } },
          lots: lots.map { |lot| lot_wire(lot, batches_by_lot, recalls, active_holds_by_batch) },
          balances: batches.map { |batch| balance_wire(batch, active_holds_by_batch.fetch(batch.id, []), inventory_date) },
          movements: movements.map { |movement| movement_wire(movement) },
          purchase_orders: orders.map { |order| purchase_order_wire(order) },
          purchase_cart: cart ? purchase_cart_wire(cart) : nil,
          shipments: orders.flat_map { |order| order.shipments.map { |shipment| shipment_wire(shipment) } },
          receipts: receipts.map { |receipt| receipt_wire(receipt) },
          recalls: recalls.map { |recall| recall_wire(recall, batches_by_lot, active_holds_by_batch) },
          controlled_reconciliations: counts.map { |count| count_wire(count) },
          audit_events: practice.audit_events.includes(:resource_manifests).order(occurred_at: :desc, id: :desc).limit(100).map { |event| audit_wire(event) },
        )
      end

      def context(practice:, actor:)
        {
          schema_version: "inventory-wire-v1",
          dataset_version: "bulk_v3",
          data_version: practice.inventory_profiles.maximum(:version) || 0,
          configuration: practice.inventory_profiles.order(version: :desc).first&.slice(:status, :version, :reason, :operator_reference),
          as_of: Time.current.iso8601,
          timezone: practice.timezone,
          practice: practice.as_json(only: %i[id name timezone]),
          users: [ { id: actor.id.to_s, name: actor.email_address.split("@").first.tr("._-", " ").titleize } ],
          current_user_id: actor.id.to_s,
          capabilities: capabilities(practice, actor)
        }
      end

      def activity(practice:, actor:, query: nil, before: nil, lot_id: nil)
        result = ActivityQuery.call(practice: practice, query: query, before: before, lot_id: lot_id)
        context(practice: practice, actor: actor).merge(
          activity_page: { query: result.query, total_count: result.total_count, filtered_count: result.filtered_count,
            before_cursor: result.before_cursor, next_cursor: result.next_cursor, page_size: ActivityQuery::PAGE_SIZE, lot_id: result.lot&.id&.to_s, lot_number: result.lot&.number },
          movements: result.movements.map do |movement|
            movement_wire(movement).merge(lot_number: movement.batch.lot.number,
              location_name: movement.batch.location_record.name, stock_unit: movement.stock_unit)
          end)
      end

      def purchase_order(order)
        { data: purchase_order_wire(order) }
      end

      def positions(practice:, actor:, **filters)
        result = ProductDetailsQuery.positions(practice: practice, **filters)
        batches = result.batches
        holds = Hold.active.where(practice_id: practice.id, batch_id: batches.map(&:id)).to_a.group_by(&:batch_id)
        lot_kinds = Hold.active.where(practice_id: practice.id).joins(:batch).where(clinic_pharmacy_batches: { lot_id: batches.map(&:lot_id) })
          .group("clinic_pharmacy_batches.lot_id").pluck("clinic_pharmacy_batches.lot_id", Arel.sql("array_agg(DISTINCT clinic_inventory_holds.kind)")).to_h
        products = PharmacyProduct.where(practice_id: practice.id, id: batches.map(&:product_id)).with_stock(practice.inventory_date).includes(:preferred_supplier).to_a
        areas = ReceiptLine.where(practice_id: practice.id, batch_id: batches.map(&:id)).where.not(area_id: nil).joins(:batch)
          .distinct.pluck("clinic_pharmacy_batches.location_id", :area_id).group_by(&:first).transform_values { |pairs| pairs.map(&:last) }
        context(practice: practice, actor: actor).merge(
          stock_page: { query: result.query, status: result.status, product_id: result.product&.id&.to_s, product_name: result.product&.name,
            page: result.page, page_count: result.page_count, page_size: ProductDetailsQuery::POSITION_PAGE_SIZE, total_count: result.total_count, filtered_count: result.filtered_count },
          unit_totals: result.unit_totals.map { |unit, physical, available| { stock_unit: unit, on_hand_units: physical.to_d.to_s("F"), available_units: available.to_d.to_s("F"), unavailable_units: (physical.to_d - available.to_d).to_s("F") } },
          products: products.map { |product| product_summary_wire(product, available: product.available_quantity, on_hand: product.on_hand_quantity, supplier_name: product.preferred_supplier&.name, supplier_id: product.preferred_supplier_id) },
          packages: products.map { |product| package_wire(product) },
          lots: batches.map(&:lot).uniq(&:id).map do |lot|
            kinds = lot_kinds.fetch(lot.id, [])
            { id: lot.id.to_s, product_id: lot.product_id.to_s, package_id: "pkg_#{lot.product_id}", lot_number: lot.number, expiration_date: lot.expires_on.iso8601,
              status: kinds.include?("recalled") ? "recalled" : kinds.any? ? "quarantined" : "active" }
          end,
          balances: batches.map { |batch| balance_wire(batch, holds.fetch(batch.id, []), practice.inventory_date) },
          locations: practice.inventory_locations.order(:name, :id).map { |location| { id: location.id.to_s, name: location.name, kind: location.kind, areas: areas.fetch(location.id, []) } })
      end

      def catalog(practice:, actor:, **filters)
        result = CatalogQuery.table(practice: practice, **filters)
        destinations = practice.sites.where(status: "active")
        %w[address_line1 city state postal_code country].each { |field| destinations = destinations.where("#{field} ~ '[^[:space:]]'") }
        context(practice: practice, actor: actor).merge(
          catalog_page: { query: result.query, status: result.status, sort: result.sort, page: result.page, page_count: result.page_count,
            total_count: result.total_count, filtered_count: result.filtered_count, page_size: CatalogQuery::TABLE_PAGE_SIZE },
          products: result.products.map { |product| product_summary_wire(product, available: product.available_quantity, on_hand: product.on_hand_quantity, supplier_name: product[:catalog_supplier_name], supplier_id: product[:catalog_supplier_id]) },
          packages: result.products.map { |product| package_wire(product) },
          can_create_purchase_order: destinations.exists?, attention_count: result.attention_count,
          attention: result.attention.map { |lot| { id: lot.id.to_s, product_id: lot.product_id.to_s, product_name: lot[:product_name], lot_number: lot.number, expiration_date: lot.expires_on.iso8601, status: lot[:hold_status] } })
      end

      def purchase_cart_wire(cart)
        {
          id: cart.id.to_s, status: cart.status, destination_site_id: cart.destination_site_id&.to_s,
          reason: cart.reason, checkout_group_id: cart.checkout_group_id, version: cart.version,
          items: cart.items.where(status: "draft").map do |item|
            offer = item.selected_supplier_product
            {
              id: item.id.to_s, product_id: item.product_id.to_s, product_name: item.product.name,
              requested_packages: item.requested_packages.to_d.to_s("F"), input_unit: item.input_unit,
              conversion_factor: item.conversion_factor.to_d.to_s("F"), supplier_id: item.selected_supplier_id&.to_s,
              supplier: item.selected_supplier&.name, supplier_product_id: item.selected_supplier_product_id&.to_s,
              supplier_sku: offer&.supplier_sku, package_quantity: item.selected_package_quantity.to_d.to_s("F"),
              supplier_packages: (item.requested_packages.to_d * item.product.package_size.to_d / item.selected_package_quantity.to_d).ceil.to_s,
              unit_price: item.selected_unit_price.to_d.to_s("F"), currency: item.selected_currency,
              extended_cost: ((item.requested_packages.to_d * item.product.package_size.to_d / item.selected_package_quantity.to_d).ceil * item.selected_unit_price.to_d).to_s("F"),
              source: item.source, price_snapshot_at: item.price_snapshot_at&.iso8601, price_snapshot_digest: item.price_snapshot_digest
            }
          end
        }
      end

      def capabilities(practice, actor)
        ability = Ability.new(actor, practice: practice)
        permissions = %w[inventory.read inventory.catalog inventory.receive inventory.adjust inventory.hold inventory.release inventory.count inventory.configure inventory.transfer inventory.put_away procurement.read procurement.create procurement.submit procurement.approve recall.read recall.lock recall.dispose controlled.read controlled.count controlled.certify]
        permissions.to_h do |permission|
          [ permission, ability.allowed_permission?(permission) ]
        end.merge("supplier_pricing" => ability.role_code_allowed?(Ability::SUPPLIER_PRICING_ROLE_CODES))
      end

      def product_wire(product, batches, active_holds_by_batch, inventory_date)
        product_batches = batches.select { |batch| batch.product_id == product.id }
        available = product_batches.sum { |batch| batch_available?(batch, active_holds_by_batch.fetch(batch.id, []), inventory_date) ? batch.quantity.to_d : 0 }
        on_hand = product_batches.sum { |batch| batch.quantity.to_d }
        supplier = product.preferred_supplier || product_batches.flat_map(&:receipt_lines).filter_map(&:receipt).max_by { |receipt| [ receipt.received_at, receipt.id ] }&.supplier
        product_summary_wire(product, available: available, on_hand: on_hand, supplier_name: supplier&.name, supplier_id: supplier&.id)
      end

      def product_summary_wire(product, available:, on_hand:, supplier_name:, supplier_id:)
        { id: product.id.to_s, name: product.name, category: product.category, ndc: product.ndc.to_s, device_identifier: product.device_identifier.to_s, schedule: product.dea_schedule, active: product.active?, package_id: package_wire(product)[:id], base_unit: product.stock_unit, units_per_package: product.package_size.to_d.to_s("F"), reorder_point_units: product.reorder_point.to_d.to_s("F"), preferred_supplier: supplier_name, preferred_supplier_id: supplier_id&.to_s, available_units: available.to_d.to_s("F"), on_hand_units: on_hand.to_d.to_s("F"), low_stock: available <= product.reorder_point }
      end

      def package_wire(product)
        { id: "pkg_#{product.id}", product_id: product.id.to_s, description: product.package_description.presence, input_unit: PACKAGE_INPUT_UNIT, units_per_package: product.package_size.to_d.to_s("F") }
      end

      def lot_wire(lot, batches_by_lot, recalls, active_holds_by_batch)
        lot_batches = batches_by_lot.fetch(lot.id, [])
        recall = recalls.find { |record| record.recall_lots.any? { |link| link.lot_id == lot.id } }
        { id: lot.id.to_s, product_id: lot.product_id.to_s, package_id: package_wire(lot.product)[:id], lot_number: lot.number, expiration_date: lot.expires_on.iso8601, recall_id: recall&.id&.to_s, status: lot_batches.any? { |batch| active_holds_by_batch.fetch(batch.id, []).any? { |hold| hold.kind == "recalled" } } ? "recalled" : lot_batches.any? { |batch| active_holds_by_batch.fetch(batch.id, []).any? } ? "quarantined" : "active" }
      end

      def balance_wire(batch, active_holds, inventory_date)
        held = active_holds.any? { |hold| hold.kind == "recalled" || hold.kind == "quarantined" } ? batch.quantity.to_d : 0
        blocked = active_holds.any? { |hold| %w[temperature damaged].include?(hold.kind) } ? batch.quantity.to_d : 0
        quarantined = active_holds.any? { |hold| hold.kind == "quarantined" || hold.kind == "recalled" } ? batch.quantity.to_d : 0
        recall_ids = active_holds.filter_map { |hold| hold.recall_id.to_s if hold.kind == "recalled" && hold.recall_id.present? }.uniq
        { id: "bal_#{batch.id}", product_id: batch.product_id.to_s, lot_id: batch.lot_id.to_s, location_id: batch.location_id.to_s, recall_ids: recall_ids, on_hand_units: batch.quantity.to_d.to_s("F"), held_units: held.to_d.to_s("F"), blocked_units: blocked.to_d.to_s("F"), quarantined_units: quarantined.to_d.to_s("F"), available_units: batch_available?(batch, active_holds, inventory_date) ? batch.quantity.to_d.to_s("F") : "0" }
      end

      def movement_wire(movement)
        quantity = movement.quantity.to_d
        receipt = movement.receipt_line&.receipt
        type = movement.kind
        { id: movement.id.to_s, type: type, lot_id: movement.batch.lot_id.to_s, location_id: movement.batch.location_id.to_s, quantity_units: quantity.abs.to_s("F"), direction: quantity.negative? ? "out" : "in", source_id: receipt ? "receipt_#{receipt.id}" : movement.request_key.to_s, occurred_at: movement.occurred_at.iso8601, actor_id: movement.actor_id&.to_s, reason: movement.reason }
      end

      def purchase_order_wire(order)
        { id: order.id.to_s, number: order.number, status: order.status, supplier: order.supplier&.name, checkout_group_id: order.checkout_group_id, destination: order.destination, receiving_site_id: order.receiving_site_id&.to_s, destination_address: order.destination_address, created_at: order.created_at.iso8601, lines: order.lines.map { |line| { id: line.id.to_s, product_id: line.product_id.to_s, package_id: package_wire(line.product)[:id], product_name: line.product_name, stock_unit: line.stock_unit, input_unit: line.input_unit, ordered_packages: line.ordered_quantity.to_d.to_s("F"), units_per_package: line.conversion_factor.to_d.to_s("F"), ordered_units: line.ordered_units.to_d.to_s("F"), package_price: line.unit_price.to_d.to_s("F"), currency: line.currency, received_units: line.received_units.to_d.to_s("F"), received_packages: line.received_quantity.to_d.to_s("F") } }, subtotal: order.subtotal.to_d.to_s("F"), tax: order.tax.to_d.to_s("F"), shipping: order.shipping.to_d.to_s("F"), total: order.total.to_d.to_s("F"), cancelled_remaining_units: order.status == "cancelled" ? order.lines.sum { |line| line.remaining_quantity.to_d }.to_s("F") : "0" }
      end

      def shipment_wire(shipment)
        { id: shipment.id.to_s, po_id: shipment.purchase_order_id.to_s, supplier_reference: shipment.supplier_reference, status: shipment.effective_status, package_count: shipment.package_count, delivered_at: shipment.delivered_at&.iso8601, expected_units: shipment.expected_units.to_d.to_s("F"), reconciliation: shipment.reconciliation&.then { |record| { id: record.id.to_s, accepted_packages: record.accepted_packages.to_d.to_s("F"), missing_packages: record.missing_packages.to_d.to_s("F"), rejected_packages: record.rejected_packages.to_d.to_s("F"), excess_packages: record.excess_packages.to_d.to_s("F"), exception: record.exception, reason: record.reason, observations: record.observations, actor_id: record.actor_id.to_s, recorded_at: record.created_at.iso8601 } }, allocations: shipment.shipment_lines.map { |line| { purchase_order_line_id: line.purchase_order_line_id.to_s, expected_packages: line.expected_packages.to_d.to_s("F") } } }
      end

      def receipt_wire(receipt)
        { id: "receipt_#{receipt.id}", shipment_id: receipt.shipment_id&.to_s, status: receipt.status, received_by: receipt.actor_id.to_s, started_at: receipt.received_at.iso8601, lines: receipt.lines.map { |line| { id: "rline_#{line.id}", lot_id: line.batch.lot_id.to_s, quantity_packages: line.input_unit == "package" ? line.input_quantity.to_d.to_s("F") : (line.quantity.to_d / line.conversion_factor.to_d).to_s("F"), quantity_units: line.quantity.to_d.to_s("F"), location_id: line.batch.location_id.to_s, area_id: line.area_id, disposition: line.disposition, temperature_c: line.temperature_c&.to_s, exception: line.exception } } }
      end

      def recall_wire(recall, batches_by_lot, active_holds_by_batch)
        batches = recall.recall_lots.flat_map { |link| batches_by_lot.fetch(link.lot_id, []) }.uniq(&:id)
        held = batches.sum { |batch| active_holds_by_batch.fetch(batch.id, []).any? { |hold| hold.kind == "recalled" && hold.recall_id == recall.id } ? batch.quantity.to_d : 0 }
        disposition = recall.dispositions.order(id: :desc).first
        { id: recall.id.to_s, reference: recall.reference, product_id: recall.product_id.to_s, lot_numbers: recall.recall_lots.map { |link| link.lot.number }, status: recall.status, effective_at: recall.effective_on.iso8601, reason: recall.reason, required_disposition: recall.required_disposition, affected_units: recall.affected_units.to_d.to_s("F"), held_units: held.to_d.to_s("F"), evidence_reference: disposition&.evidence_reference, disposition_units: recall.dispositions.sum(:quantity).to_d.to_s("F") }
      end

      def batch_available?(batch, active_holds, inventory_date)
        active_holds.empty? && batch.expires_on >= inventory_date && batch.product.active?
      end

      def count_wire(count)
        investigation = ControlReview.where(count_id: count.id, kind: "investigation").order(id: :desc).first
        certification = ControlReview.where(count_id: count.id, kind: "certification").order(id: :desc).first
        settled_expected = count.approval.present? ? count.observed_quantity.to_d : count.expected_quantity.to_d
        variance = count.observed_quantity.to_d - settled_expected
        { id: "recon_#{count.id}", count_id: count.id.to_s, product_id: count.batch.product_id.to_s, lot_id: count.batch.lot_id.to_s, location_id: count.batch.location_id.to_s, status: certification ? "certified" : investigation ? "resolved" : "variance_review", expected_units: settled_expected.to_d.to_s("F"), counted_units: count.observed_quantity.to_d.to_s("F"), variance_units: variance.to_s("F"), counted_at: count.created_at.iso8601, counter_id: count.actor_id.to_s, investigation_required: variance.nonzero? && investigation.nil?, investigation_note: investigation&.reason, certified_at: certification&.created_at&.iso8601, certified_by: certification&.actor_id&.to_s }
      end

      def audit_wire(event)
        { id: event.id.to_s, action: event.action_code, actor_id: event.actor_session_reference.to_s.sub(/^user:/, ""), entity_id: event.resource_manifests.first&.protected_resource_version_ref, occurred_at: event.occurred_at.iso8601 }
      end


    end
  end
end
