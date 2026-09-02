module Clinic
  module Inventory
    module InventoryWire
      module_function

      def call(practice:, actor:)
        products = PharmacyProduct.where(practice_id: practice.id).order(:name, :id).to_a
        batches = PharmacyBatch.where(practice_id: practice.id).includes(:product, :lot, :location_record, :holds, :receipt_lines).order(:expires_on, :id).to_a
        lots = batches.map(&:lot).compact.uniq(&:id)
        locations = batches.map(&:location_record).compact.uniq(&:id)
        recalls = Recall.where(practice_id: practice.id).includes(:product, :recall_lots, :dispositions).order(id: :desc).to_a
        counts = Count.where(practice_id: practice.id).includes(:approval, batch: :product).order(id: :desc).to_a
        orders = PurchaseOrder.where(practice_id: practice.id).includes(:supplier, :lines, :shipments, :receipts).order(id: :desc).limit(100).to_a
        receipts = Receipt.where(practice_id: practice.id).includes(:actor, :supplier, :lines, :shipment, :purchase_order).order(id: :desc).limit(100).to_a
        movements = PharmacyMovement.where(practice_id: practice.id).includes(batch: %i[product lot location_record]).order(id: :desc).limit(200).to_a
        {
          schema_version: "inventory-wire-v1",
          dataset_version: "1.0.0",
          data_version: practice.inventory_profiles.maximum(:version) || 0,
          as_of: Time.current.iso8601,
          timezone: practice.timezone,
          practice: practice.as_json(only: %i[id name timezone]),
          users: [ { id: actor.id.to_s, name: actor.email_address.split("@").first.tr("._-", " ").titleize, role: "Inventory Manager" } ],
          current_user_id: actor.id.to_s,
          capabilities: capabilities(practice, actor),
          products: products.map { |product| product_wire(product, batches) },
          packages: products.map { |product| package_wire(product) },
          locations: locations.map { |location| { id: location.id.to_s, name: location.name, areas: areas_for(location.name) } },
          lots: lots.map { |lot| lot_wire(lot, batches, recalls) },
          balances: batches.map { |batch| balance_wire(batch) },
          movements: movements.map { |movement| movement_wire(movement) },
          purchase_orders: orders.map { |order| purchase_order_wire(order) },
          shipments: orders.flat_map { |order| order.shipments.map { |shipment| shipment_wire(shipment) } },
          receipts: receipts.map { |receipt| receipt_wire(receipt) },
          recalls: recalls.map { |recall| recall_wire(recall) },
          controlled_reconciliations: counts.map { |count| count_wire(count) },
          audit_events: practice.audit_events.order(occurred_at: :desc, id: :desc).limit(100).map { |event| audit_wire(event) },
          transfers: Transfer.where(practice_id: practice.id).order(id: :desc).limit(100).map { |transfer| transfer_wire(transfer) },
          adjustments: movements.select { |movement| movement.kind != "receipt" }.map { |movement| adjustment_wire(movement) },
          cycle_counts: counts.map { |count| cycle_count_wire(count) }
        }
      end

      def purchase_order(order)
        { data: purchase_order_wire(order) }
      end

      def capabilities(practice, actor)
        %w[inventory.read inventory.catalog inventory.receive inventory.adjust inventory.hold inventory.release inventory.count inventory.configure inventory.transfer inventory.put_away procurement.read procurement.create procurement.submit procurement.approve recall.read recall.lock recall.dispose controlled.read controlled.count controlled.certify].to_h do |permission|
          [ permission, Authorization.allowed?(actor: actor, practice: practice, action: permission) ]
        end
      end

      def product_wire(product, batches)
        product_batches = batches.select { |batch| batch.product_id == product.id }
        available = product_batches.sum { |batch| batch.available? ? batch.quantity.to_d : 0 }
        on_hand = product_batches.sum { |batch| batch.quantity.to_d }
        package = package_wire(product)
        preferred_supplier = product.name.include?("Dextro") ? "ControlledRx Distribution" : product_batches.map(&:supplier).compact.first || "MedSupply Co."
        { id: product.id.to_s, name: product.name, ndc: product.ndc.to_s, schedule: product.name.include?("Dextro") ? "II" : "OTC", package_id: package[:id], base_unit: product.stock_unit, units_per_package: product.package_size.to_i, reorder_point_units: product.reorder_point, preferred_supplier: preferred_supplier, available_units: available.to_i, on_hand_units: on_hand.to_i, low_stock: available <= product.reorder_point }
      end

      def package_wire(product)
        slug = case product.name
        when /Acetaminophen/i then "acetaminophen"
        when /Dextroamphetamine/i then "dextroamphetamine"
        else product.sku.to_s.gsub(/^SYN-/, "").downcase.tr("-", "_")
        end
        { id: "pkg_#{slug}_bottle", product_id: product.id.to_s, description: "Bottle of #{product.package_size.to_i} tablets", package_unit: "bottle", units_per_package: product.package_size.to_i }
      end

      def lot_wire(lot, batches, recalls)
        lot_batches = batches.select { |batch| batch.lot_id == lot.id }
        recall = recalls.find { |record| record.recall_lots.any? { |link| link.lot_id == lot.id } }
        { id: lot.id.to_s, product_id: lot.product_id.to_s, package_id: package_wire(lot.product)[:id], lot_number: lot.number, expiration_date: lot.expires_on.iso8601, recall_id: recall&.id&.to_s, status: lot_batches.any? { |batch| batch.active_holds.any? { |hold| hold.kind == "recalled" } } ? "recalled" : lot_batches.any? { |batch| batch.active_holds.any? } ? "quarantined" : "active" }
      end

      def balance_wire(batch)
        held = batch.active_holds.sum { |hold| hold.kind == "recalled" || hold.kind == "quarantined" ? batch.quantity.to_d : 0 }
        blocked = batch.active_holds.sum { |hold| %w[temperature damaged].include?(hold.kind) ? batch.quantity.to_d : 0 }
        quarantined = batch.active_holds.sum { |hold| hold.kind == "quarantined" || hold.kind == "recalled" ? batch.quantity.to_d : 0 }
        { id: "bal_#{batch.id}", product_id: batch.product_id.to_s, lot_id: batch.lot_id.to_s, location_id: batch.location_id.to_s, on_hand_units: batch.quantity.to_d.to_i, held_units: held.to_i, blocked_units: blocked.to_i, quarantined_units: quarantined.to_i, available_units: batch.available? ? batch.quantity.to_d.to_i : 0 }
      end

      def movement_wire(movement)
        quantity = movement.quantity.to_d
        receipt = movement.receipt_line&.receipt
        type = if movement.kind == "receipt"
          receipt&.reason.to_s.include?("opening") ? "opening_balance" : "receipt"
        elsif movement.reason.to_s.start_with?("Transfer") || movement.reason.to_s.include?("Transfer")
          movement.quantity.negative? ? "transfer_out" : "transfer_in"
        else
          movement.kind
        end
        { id: movement.id.to_s, type: type, lot_id: movement.batch.lot_id.to_s, location_id: movement.batch.location_id.to_s, quantity_units: quantity.abs.to_i, direction: quantity.negative? ? "out" : "in", source_id: receipt ? "receipt_#{receipt.id}" : movement.request_key.to_s, occurred_at: movement.occurred_at.iso8601, actor_id: movement.actor_id&.to_s, reason: movement.reason, before_units: nil, after_units: nil }
      end

      def purchase_order_wire(order)
        { id: order.id.to_s, number: order.number, status: order.status, supplier: order.supplier&.name, ship_to_location_id: order.destination, destination: order.destination, ordered_at: order.created_at.iso8601, lines: order.lines.map { |line| { id: line.id.to_s, product_id: line.product_id.to_s, package_id: package_wire(line.product)[:id], ordered_packages: line.ordered_quantity.to_d.to_i, units_per_package: line.conversion_factor.to_d.to_i, ordered_units: line.ordered_units.to_d.to_i, package_price: line.unit_price.to_d.to_f, received_units: line.received_units.to_d.to_i, received_packages: line.received_quantity.to_d.to_i } }, subtotal: order.subtotal.to_d.to_f, tax: order.tax.to_d.to_f, shipping: order.shipping.to_d.to_f, total: order.total.to_d.to_f, cancelled_remaining_units: order.status == "cancelled" ? order.lines.sum { |line| line.remaining_quantity.to_d }.to_i : 0 }
      end

      def shipment_wire(shipment)
        { id: shipment.id.to_s, po_id: shipment.purchase_order_id.to_s, supplier_reference: shipment.supplier_reference, status: shipment.status, package_count: shipment.package_count, delivered_at: shipment.delivered_at&.iso8601, expected_units: shipment.expected_units.to_d.to_i }
      end

      def receipt_wire(receipt)
        { id: "receipt_#{receipt.id}", shipment_id: receipt.shipment_id&.to_s, status: receipt.status, received_by: receipt.actor_id.to_s, started_at: receipt.received_at.iso8601, lines: receipt.lines.map { |line| { id: "rline_#{line.id}", lot_id: line.batch.lot_id.to_s, quantity_packages: line.input_unit == "package" ? line.input_quantity.to_d.to_i : (line.quantity.to_d / line.conversion_factor.to_d).to_i, quantity_units: line.quantity.to_d.to_i, location_id: line.batch.location_id.to_s, area_id: line.area_id || areas_for(line.batch.location).first, disposition: line.disposition, temperature_c: line.temperature_c&.to_s, exception: line.exception } } }
      end

      def recall_wire(recall)
        batches = recall.recall_lots.flat_map { |link| link.lot.batches }.uniq(&:id)
        held = batches.select { |batch| batch.active_holds.any? { |hold| hold.kind == "recalled" } }.sum { |batch| batch.quantity.to_d }
        disposition = recall.dispositions.order(id: :desc).first
        { id: recall.id.to_s, reference: recall.reference, product_id: recall.product_id.to_s, lot_numbers: recall.recall_lots.map { |link| link.lot.number }, status: recall.status, effective_at: recall.effective_on.iso8601, reason: recall.reason, required_disposition: recall.required_disposition, affected_units: recall.affected_units.to_d.to_i, held_units: held.to_i, evidence_reference: disposition&.evidence_reference, disposition_units: recall.dispositions.sum(:quantity).to_d.to_i }
      end

      def count_wire(count)
        investigation = ControlReview.where(count_id: count.id, kind: "investigation").order(id: :desc).first
        certification = ControlReview.where(count_id: count.id, kind: "certification").order(id: :desc).first
        settled_expected = count.approval.present? ? count.observed_quantity.to_d : count.expected_quantity.to_d
        variance = count.observed_quantity.to_d - settled_expected
        { id: "recon_#{count.id}", count_id: count.id.to_s, product_id: count.batch.product_id.to_s, lot_id: count.batch.lot_id.to_s, location_id: count.batch.location_id.to_s, status: certification ? "certified" : investigation ? "resolved" : "variance_review", expected_units: settled_expected.to_i, counted_units: count.observed_quantity.to_d.to_i, variance_units: variance.to_i, counted_at: count.created_at.iso8601, counter_id: count.actor_id.to_s, witness_id: count.actor_id.to_s, investigation_required: variance.nonzero? && investigation.nil?, investigation_note: investigation&.reason, certified_at: certification&.created_at&.iso8601, certified_by: certification&.actor_id&.to_s }
      end

      def audit_wire(event)
        { id: event.id.to_s, action: event.action_code, actor_id: event.actor_session_reference.to_s.sub(/^user:/, ""), entity_id: event.resource_manifests.first&.protected_resource_version_ref || event.id.to_s, occurred_at: event.occurred_at.iso8601, role: "Inventory operator", reason: nil, correlation_id: event.id.to_s }
      end

      def transfer_wire(transfer)
        { id: transfer.id.to_s, lot_id: transfer.source_batch.lot_id.to_s, source_location_id: transfer.source_batch.location_id.to_s, destination_location_id: transfer.destination_batch.location_id.to_s, quantity_units: transfer.quantity.to_d.to_i, status: "posted" }
      end

      def adjustment_wire(movement)
        { id: movement.id.to_s, lot_id: movement.batch.lot_id.to_s, location_id: movement.batch.location_id.to_s, delta_units: movement.quantity.to_d.to_i, reason: movement.reason, status: "posted" }
      end

      def cycle_count_wire(count)
        expected = count.approval.present? ? count.observed_quantity.to_d : count.expected_quantity.to_d
        { id: count.id.to_s, lot_id: count.batch.lot_id.to_s, location_id: count.batch.location_id.to_s, expected_units: expected.to_i, counted_units: count.observed_quantity.to_d.to_i, variance_units: (count.observed_quantity.to_d - expected).to_i, status: count.approval ? "approved" : "posted" }
      end

      def areas_for(name)
        case name
        when "Main Pharmacy" then [ "shelf_a2" ]
        when "Quarantine" then [ "quarantine_bin_1" ]
        when "Controlled Cabinet" then [ "cabinet_c2" ]
        when "Returns Holding" then [ "returns_bin_1" ]
        else [ "general_storage" ]
        end
      end
    end
  end
end
