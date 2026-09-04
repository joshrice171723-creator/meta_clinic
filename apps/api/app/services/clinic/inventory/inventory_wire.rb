module Clinic
  module Inventory
    module InventoryWire
      module_function
      PACKAGE_INPUT_UNIT = "package".freeze

      def call(practice:, actor:)
        products = PharmacyProduct.where(practice_id: practice.id).order(:name, :id).to_a
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
          { shipments: [ :receipts, :shipment_lines ] }
        ).order(id: :desc).limit(100).to_a
        receipts = Receipt.where(practice_id: practice.id).includes(
          :actor,
          :supplier,
          :shipment,
          :purchase_order,
          { lines: { batch: [ :lot, :location_record ] } }
        ).order(id: :desc).limit(100).to_a
        suppliers = Supplier.where(practice_id: practice.id).order(:name, :id).to_a
        area_by_location = ReceiptLine.where(practice_id: practice.id, batch_id: batches.map(&:id)).where.not(area_id: nil).includes(batch: :location_record).to_a.group_by { |line| line.batch.location_id }.transform_values { |lines| lines.map(&:area_id).compact.uniq }
        movements = PharmacyMovement.where(practice_id: practice.id).includes(
          { batch: %i[product lot location_record] },
          { receipt_line: :receipt }
        ).order(id: :desc).limit(200).to_a
        {
          schema_version: "inventory-wire-v1",
          dataset_version: "bulk_v3",
          data_version: practice.inventory_profiles.maximum(:version) || 0,
          as_of: Time.current.iso8601,
          timezone: practice.timezone,
          practice: practice.as_json(only: %i[id name timezone]),
          users: [ { id: actor.id.to_s, name: actor.email_address.split("@").first.tr("._-", " ").titleize } ],
          current_user_id: actor.id.to_s,
          capabilities: capabilities(practice, actor),
          products: products.map { |product| product_wire(product, batches, suppliers, active_holds_by_batch, inventory_date) },
          packages: products.map { |product| package_wire(product) },
          suppliers: suppliers.map { |supplier| { id: supplier.id.to_s, name: supplier.name } },
          locations: locations.map { |location| { id: location.id.to_s, name: location.name, kind: location.kind, areas: area_by_location.fetch(location.id, []) } },
          lots: lots.map { |lot| lot_wire(lot, batches_by_lot, recalls, active_holds_by_batch) },
          balances: batches.map { |batch| balance_wire(batch, active_holds_by_batch.fetch(batch.id, []), inventory_date) },
          movements: movements.map { |movement| movement_wire(movement) },
          purchase_orders: orders.map { |order| purchase_order_wire(order) },
          shipments: orders.flat_map { |order| order.shipments.map { |shipment| shipment_wire(shipment) } },
          receipts: receipts.map { |receipt| receipt_wire(receipt) },
          recalls: recalls.map { |recall| recall_wire(recall, batches_by_lot, active_holds_by_batch) },
          controlled_reconciliations: counts.map { |count| count_wire(count) },
          audit_events: practice.audit_events.includes(:resource_manifests).order(occurred_at: :desc, id: :desc).limit(100).map { |event| audit_wire(event) },
          transfers: Transfer.where(practice_id: practice.id).includes(:source_batch, :destination_batch).order(id: :desc).limit(100).map { |transfer| transfer_wire(transfer) },
          adjustments: movements.select { |movement| movement.kind != "receipt" }.map { |movement| adjustment_wire(movement) },
          cycle_counts: counts.map { |count| cycle_count_wire(count) }
        }
      end

      def purchase_order(order)
        { data: purchase_order_wire(order) }
      end

      def capabilities(practice, actor)
        ability = Ability.new(actor, practice: practice)
        %w[inventory.read inventory.catalog inventory.receive inventory.adjust inventory.hold inventory.release inventory.count inventory.configure inventory.transfer inventory.put_away procurement.read procurement.create procurement.submit procurement.approve recall.read recall.lock recall.dispose controlled.read controlled.count controlled.certify].to_h do |permission|
          [ permission, ability.allowed_permission?(permission) ]
        end
      end

      def product_wire(product, batches, suppliers, active_holds_by_batch, inventory_date)
        product_batches = batches.select { |batch| batch.product_id == product.id }
        available = product_batches.sum { |batch| batch_available?(batch, active_holds_by_batch.fetch(batch.id, []), inventory_date) ? batch.quantity.to_d : 0 }
        on_hand = product_batches.sum { |batch| batch.quantity.to_d }
        package = package_wire(product)
        supplier = product_batches.flat_map(&:receipt_lines).filter_map(&:receipt).max_by { |receipt| [ receipt.received_at, receipt.id ] }&.supplier
        { id: product.id.to_s, name: product.name, ndc: product.ndc.to_s, schedule: product.dea_schedule, package_id: package[:id], base_unit: product.stock_unit, units_per_package: product.package_size.to_d.to_s("F"), reorder_point_units: product.reorder_point.to_d.to_s("F"), preferred_supplier: supplier&.name, preferred_supplier_id: supplier&.id&.to_s, available_units: available.to_d.to_s("F"), on_hand_units: on_hand.to_d.to_s("F"), low_stock: available <= product.reorder_point }
      end

      def package_wire(product)
        { id: "pkg_#{product.id}", product_id: product.id.to_s, description: product.package_description.presence, package_unit: PACKAGE_INPUT_UNIT, units_per_package: product.package_size.to_d.to_s("F") }
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
        { id: order.id.to_s, number: order.number, status: order.status, supplier: order.supplier&.name, destination: order.destination, ordered_at: order.created_at.iso8601, lines: order.lines.map { |line| { id: line.id.to_s, product_id: line.product_id.to_s, package_id: package_wire(line.product)[:id], ordered_packages: line.ordered_quantity.to_d.to_s("F"), units_per_package: line.conversion_factor.to_d.to_s("F"), ordered_units: line.ordered_units.to_d.to_s("F"), package_price: line.unit_price.to_d.to_s("F"), currency: line.currency, received_units: line.received_units.to_d.to_s("F"), received_packages: line.received_quantity.to_d.to_s("F") } }, subtotal: order.subtotal.to_d.to_s("F"), tax: order.tax.to_d.to_s("F"), shipping: order.shipping.to_d.to_s("F"), total: order.total.to_d.to_s("F"), cancelled_remaining_units: order.status == "cancelled" ? order.lines.sum { |line| line.remaining_quantity.to_d }.to_s("F") : "0" }
      end

      def shipment_wire(shipment)
        { id: shipment.id.to_s, po_id: shipment.purchase_order_id.to_s, supplier_reference: shipment.supplier_reference, status: shipment.effective_status, package_count: shipment.package_count, delivered_at: shipment.delivered_at&.iso8601, expected_units: shipment.expected_units.to_d.to_s("F"), allocations: shipment.shipment_lines.map { |line| { purchase_order_line_id: line.purchase_order_line_id.to_s, expected_packages: line.expected_packages.to_d.to_s("F") } } }
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

      def transfer_wire(transfer)
        { id: transfer.id.to_s, lot_id: transfer.source_batch.lot_id.to_s, source_location_id: transfer.source_batch.location_id.to_s, destination_location_id: transfer.destination_batch.location_id.to_s, quantity_units: transfer.quantity.to_d.to_s("F"), status: "posted" }
      end

      def adjustment_wire(movement)
        { id: movement.id.to_s, lot_id: movement.batch.lot_id.to_s, location_id: movement.batch.location_id.to_s, delta_units: movement.quantity.to_d.to_s("F"), reason: movement.reason, status: "posted" }
      end

      def cycle_count_wire(count)
        expected = count.approval.present? ? count.observed_quantity.to_d : count.expected_quantity.to_d
        { id: count.id.to_s, lot_id: count.batch.lot_id.to_s, location_id: count.batch.location_id.to_s, expected_units: expected.to_d.to_s("F"), counted_units: count.observed_quantity.to_d.to_s("F"), variance_units: (count.observed_quantity.to_d - expected).to_s("F"), status: count.approval ? "approved" : "posted" }
      end
    end
  end
end
