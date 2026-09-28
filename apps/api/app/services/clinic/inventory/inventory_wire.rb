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
          { shipments: [ :receipts, :shipment_lines, :reconciliation, { shipment_events: :recorded_by_membership } ] }
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
        supplier_products = SupplierProduct.where(practice_id: practice.id).includes(:supplier, :product).order(:ndc, :supplier_sku, :id).to_a
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
          supplier_products: supplier_products.map { |row| supplier_product_wire(row, on: inventory_date) },
          locations: location_directory(practice: practice, areas_by_location: area_by_location),
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
        read_context = context(practice: practice, actor: actor)
        use_ids = result.movements.filter_map { |movement| movement.id if movement.kind == "adjustment_out" }
        reversed_ids = PharmacyMovement.where(practice_id: practice.id, reverses_entry_id: use_ids).pluck(:reverses_entry_id).to_set
        administration_ids = Clinic::Care::MedicationAdministrationMovement.where(practice_id: practice.id, inventory_entry_id: use_ids).pluck(:inventory_entry_id).to_set
        dispense_ids = Clinic::Care::MedicationDispense.where(practice_id: practice.id, inventory_entry_id: use_ids).pluck(:inventory_entry_id).to_set
        read_context.merge(
          activity_page: { query: result.query, total_count: result.total_count, filtered_count: result.filtered_count,
            before_cursor: result.before_cursor, next_cursor: result.next_cursor, page_size: ActivityQuery::PAGE_SIZE, lot_id: result.lot&.id&.to_s, lot_number: result.lot&.number },
          movements: result.movements.map do |movement|
            movement_wire(movement).merge(product_id: movement.batch.lot.product_id.to_s,
              lot_number: movement.batch.lot.number,
              location_name: movement.batch.location_record.name, stock_unit: movement.stock_unit,
              can_reverse: read_context[:capabilities]["inventory.adjust"] && movement.kind == "adjustment_out" &&
                movement.transfer_id.nil? && movement.recall_disposition_id.nil? &&
                !reversed_ids.include?(movement.id) && !administration_ids.include?(movement.id) && !dispense_ids.include?(movement.id))
          end)
      end

      def purchase_order(order)
        { data: purchase_order_wire(order) }
      end

      def count_sessions(practice:, actor:, **filters)
        result = CountSessionsQuery.call(practice: practice, actor: actor, **filters)
        context = context(practice: practice, actor: actor)
        sessions = (result.sessions + [ result.selected ]).compact.uniq(&:id)
        paths = location_paths(practice: practice, ids: sessions.map(&:location_id))
        context.merge(
          count_page: { query: result.query, status: result.status, page: result.page, page_count: result.page_count, page_size: CountSessionsQuery::PAGE_SIZE,
            total_count: result.total_count, filtered_count: result.filtered_count, selected_id: result.selected&.id&.to_s },
          sessions: result.sessions.map { |session| count_session_wire(session, paths) }, selected_session: result.selected && count_session_wire(result.selected, paths),
          lines: result.lines.map do |line|
            batch = line.batch
            count = result.observations[line.id]
            count.association(:batch).target = batch if count
            event = result.line_events[line.id]
            current = count && count_current?(count, result.cutoffs[batch.id])
            observed = event&.kind == "observed" && event.count_id == count&.id
            skipped = event&.kind == "skipped"
            can_approve = count && current && observed && result.selected.status == "open" && count.approval.nil? && count.actor_id != actor.id && context[:capabilities]["inventory.count"] &&
              (count.expected_quantity == count.observed_quantity || context[:capabilities]["inventory.adjust"])
            { id: line.id.to_s, batch_id: batch.id.to_s, product_id: batch.product_id.to_s, product_name: batch.product.name, stock_unit: batch.product.stock_unit,
              lot_number: batch.lot.number, location_path: paths[batch.location_id.to_s], expires_on: batch.expires_on.iso8601,
              skipped: skipped, skip_reason: skipped ? event.reason : nil,
              expected_units: result.selected.blind? ? (observed ? count.expected_quantity.to_d.to_s("F") : nil) : batch.quantity.to_s("F"),
              latest_count: count && count_observation_wire(count).merge(actor_id: count.actor_id.to_s, created_at: count.created_at.iso8601,
                approved: count.approval.present?, stale: !current || !observed, can_approve: !!can_approve),
              reconciled: !!(observed && current && (count.approval.present? || count.observed_quantity == count.expected_quantity)) }
          end,
          line_page: { page: result.line_page, page_count: result.line_page_count, total_count: result.line_count, page_size: CountSessionsQuery::LINE_PAGE_SIZE },
          history_page: { page: result.history_page, page_count: result.history_page_count, total_count: result.history_count, page_size: CountSessionsQuery::HISTORY_PAGE_SIZE },
          events: result.events.map do |event|
            { id: event.id.to_s, kind: event.kind, line_id: event.count_session_line_id&.to_s, actor_id: event.actor_id.to_s, assignee_id: event.assignee_id&.to_s,
              reason: event.reason, created_at: event.created_at.iso8601, count: event.count && count_observation_wire(event.count) }
          end,
          locations: location_directory(practice: practice).select { |location| location[:stock_destination] }.map { |location| location.slice(:id, :path) },
          assignees: count_session_assignees(practice: practice).map do |member|
            { id: member.user_id.to_s, name: member.user.email_address.split("@").first.tr("._-", " ").titleize }
          end)
      end

      def count_session_assignees(practice:)
        now = Time.current
        assignees = Clinic::Membership.active.where(practice_id: practice.id).joins(:user, :role_grants)
          .joins("INNER JOIN role_version_permissions ON role_version_permissions.role_version_id = clinic_role_grants.role_version_id")
          .joins("INNER JOIN permissions ON permissions.id = role_version_permissions.permission_id")
          .where(users: { active: true }, permissions: { action_code: "inventory.count" })
          .where(clinic_role_grants: { scope_kind: "practice", revoked_at: nil })
          .where("clinic_role_grants.effective_from <= ?", now)
          .where("clinic_role_grants.effective_until IS NULL OR clinic_role_grants.effective_until > ?", now)
          .distinct.includes(:user).order(:user_id).to_a

        return assignees unless development_omni_access?

        omni_email = Development::TestAccounts::PROFILES.fetch("omni").fetch(:email)
        omni = Clinic::Membership.active.joins(:user).where(practice_id: practice.id, users: { active: true, email_address: omni_email })
          .includes(:user).to_a
        (assignees + omni).uniq(&:id).sort_by(&:user_id)
      end

      def development_omni_access?
        Rails.env.test? || DevelopmentAccess.enabled?
      end

      def count_session_wire(session, paths)
        { id: session.id.to_s, location_id: session.location_id.to_s, location_path: paths[session.location_id.to_s], assignee_id: session.assignee_id.to_s,
          assignee_name: session.assignee.email_address.split("@").first.tr("._-", " ").titleize, due_on: session.due_on.iso8601, blind: session.blind?, status: session.status,
          reason: session.reason, created_at: session.created_at.iso8601, line_count: session[:line_count].to_i, observed_count: session[:observed_count].to_i,
          skipped_count: session[:skipped_count].to_i, reconciled_count: session[:reconciled_count].to_i }
      end

      def count_observation_wire(count)
        { id: count.id.to_s, expected_units: count.expected_quantity.to_d.to_s("F"), counted_units: count.observed_quantity.to_d.to_s("F"),
          variance_units: (count.observed_quantity - count.expected_quantity).to_s("F") }
      end

      def controlled_counts(practice:, actor:, **filters)
        result = ControlledCountsQuery.call(practice: practice, **filters)
        context = context(practice: practice, actor: actor)
        permissions = context[:capabilities]
        batches = result.counts.map(&:batch).uniq(&:id)
        paths = location_paths(practice: practice, ids: batches.map(&:location_id))
        reviews = ControlReview.where(practice_id: practice.id, count_id: result.counts.map(&:id)).order(:id).to_a.group_by(&:count_id)
        context.merge(
          controlled_page: { query: result.query, status: result.status, page: result.page, page_count: result.page_count, total_count: result.total_count, filtered_count: result.filtered_count, page_size: ControlledCountsQuery::PAGE_SIZE },
          products: batches.map(&:product).uniq(&:id).map { |product| { id: product.id.to_s, name: product.name, ndc: product.ndc.to_s, base_unit: product.stock_unit, schedule: product.dea_schedule } },
          lots: batches.map(&:lot).uniq(&:id).map { |lot| { id: lot.id.to_s, product_id: lot.product_id.to_s, lot_number: lot.number, expiration_date: lot.expires_on.iso8601 } },
          locations: batches.map(&:location_record).uniq(&:id).map { |location| { id: location.id.to_s, name: paths[location.id.to_s] } },
          controlled_reconciliations: result.counts.map do |count|
            history = reviews.fetch(count.id, [])
            investigation = history.reverse.find { |review| review.kind == "investigation" }
            certification = history.reverse.find { |review| review.kind == "certification" }
            current = count_current?(count, result.cutoffs[count.batch_id]) && count[:session_current] == true
            distinct_actor = count.actor_id != actor.id
            approval_allowed = permissions["inventory.count"] && distinct_actor && (count.observed_quantity == count.expected_quantity || permissions["inventory.adjust"])
            count_wire(count, reviews: history).merge(approved: count.approval.present?, stale: !current,
              can_investigate: current && !investigation && approval_allowed && (count.approval.nil? || count.approval.actor_id == actor.id) && permissions["controlled.count"],
              can_certify: current && investigation.present? && !certification && distinct_actor && investigation.actor_id != actor.id && permissions["controlled.certify"])
          end)
      end

      def count_current?(count, cutoff)
        if count.approval
          count.batch.quantity == count.observed_quantity && cutoff == (count.approval.entry_id || count.cutoff_entry_id)
        else
          count.batch.quantity == count.expected_quantity && cutoff == count.cutoff_entry_id
        end
      end

      def recall_cases(practice:, actor:, **filters)
        result = RecallCasesQuery.call(practice: practice, **filters)
        paths = location_paths(practice: practice, ids: result.positions.map(&:location_id))
        held_ids = result.selected ? Hold.active.where(practice_id: practice.id, recall_id: result.selected.id, batch_id: result.positions.map(&:id)).pluck(:batch_id) : []
        context(practice: practice, actor: actor).merge(
          recall_page: { query: result.query, status: result.status, page: result.page, page_count: result.page_count, page_size: RecallCasesQuery::PAGE_SIZE,
            total_count: result.total_count, filtered_count: result.filtered_count, selected_id: result.selected&.id&.to_s },
          recalls: result.cases.map { |record| recall_case_wire(record) }, selected_recall: result.selected && recall_case_wire(result.selected),
          positions: result.positions.map do |batch|
            { batch_id: batch.id.to_s, lot_id: batch.lot_id.to_s, lot_number: batch.lot.number, location_id: batch.location_id.to_s,
              location_path: paths[batch.location_id.to_s], expires_on: batch.expires_on.iso8601, on_hand_units: batch.quantity.to_s("F"), held_for_case: held_ids.include?(batch.id) }
          end,
          position_page: { page: result.position_page, page_count: result.position_page_count, total_count: result.position_count, page_size: RecallCasesQuery::PAGE_SIZE },
          dispositions: result.dispositions.map do |entry|
            { id: entry.id.to_s, batch_id: entry.batch_id.to_s, quantity_units: entry.quantity.to_d.to_s("F"), method: entry.method,
              evidence_reference: entry.evidence_reference, reason: entry.reason, actor_id: entry.actor_id.to_s, created_at: entry.created_at.iso8601 }
          end,
          history_page: { page: result.history_page, page_count: result.history_page_count, total_count: result.history_count, page_size: RecallCasesQuery::PAGE_SIZE },
          lot_options: result.lot_options.map do |lot|
            { id: lot.id.to_s, product_id: lot.product_id.to_s, product_name: lot.product.name, stock_unit: lot.product.stock_unit, lot_number: lot.number, expires_on: lot.expires_on.iso8601 }
          end,
          lot_page: { query: result.lot_query, product_id: result.product_id&.to_s, page: result.lot_page, page_count: result.lot_page_count, total_count: result.lot_count, page_size: RecallCasesQuery::PAGE_SIZE })
      end

      def recall_case_wire(recall)
        closure = recall.closure
        remaining = recall[:on_hand_units].to_d
        held = recall[:held_units].to_d
        { id: recall.id.to_s, reference: recall.reference, product_id: recall.product_id.to_s, product_name: recall.product.name, stock_unit: recall.product.stock_unit,
          status: closure || recall.status == "closed" ? "closed" : "inventory_locked", effective_at: recall.effective_on.iso8601,
          reason: recall.reason, required_disposition: recall.required_disposition, affected_units: recall.affected_units.to_d.to_s("F"), remaining_units: remaining.to_s("F"),
          held_units: held.to_s("F"), uncontained_units: [ remaining - held, 0.to_d ].max.to_s("F"), disposition_units: recall[:disposed_units].to_d.to_s("F"), lot_count: recall[:linked_lot_count].to_i,
          closure: closure && { reason: closure.reason, evidence_reference: closure.evidence_reference, actor_id: closure.actor_id.to_s, created_at: closure.created_at.iso8601 } }
      end

      def exceptions(practice:, actor:, **filters)
        result = ExceptionQueueQuery.call(practice: practice, **filters)
        paths = location_paths(practice: practice, ids: result.rows.filter_map { |row| row["location_id"] })
        context(practice: practice, actor: actor).merge(
          exception_page: { query: result.query, status: result.status, category: result.category, page: result.page, page_count: result.page_count,
            page_size: ExceptionQueueQuery::PAGE_SIZE, total_count: result.total_count, filtered_count: result.filtered_count },
          exceptions: result.rows.map do |row|
            row.slice("source_kind", "category", "title", "product_name", "lot_number", "stock_unit", "details", "state", "reason", "evidence_reference").symbolize_keys.merge(
              id: [ row["source_kind"], row["source_id"], row["category"] ].join(":"), source_id: row["source_id"].to_s,
              product_id: row["product_id"]&.to_s, location_id: row["location_id"]&.to_s, location_path: paths[row["location_id"]&.to_s],
              expires_on: row["expires_on"]&.iso8601, quantity_units: row["quantity_units"]&.to_d&.to_s("F"), shipment_id: row["shipment_id"]&.to_s,
              assignee_id: row["assignee_id"]&.to_s, reviewed_at: row["reviewed_at"]&.iso8601, reviewed_by: row["reviewed_by"]&.to_s, review_id: row["review_id"]&.to_s)
          end,
          assignees: Clinic::Membership.active.where(practice_id: practice.id).joins(:user).where(users: { active: true }).includes(:user).order(:user_id).map do |member|
            { id: member.user_id.to_s, name: member.user.email_address.split("@").first.tr("._-", " ").titleize }
          end)
      end

      def locations(practice:, actor:, **filters)
        result = LocationQuery.call(practice: practice, **filters)
        directory = location_directory(practice: practice)
        by_id = directory.index_by { |location| location[:id].to_i }
        context(practice: practice, actor: actor).merge(
          location_page: { query: result.query, status: result.status, page: result.page, page_count: result.page_count,
            page_size: LocationQuery::PAGE_SIZE, total_count: result.total_count, filtered_count: result.filtered_count },
          locations: result.ids.filter_map { |id| by_id[id] }, location_options: directory,
          sites: practice.sites.order(:name, :id).map { |site| Clinic::FacilitySerializer.site(site) })
      end

      def location_paths(practice:, ids:)
        return {} if ids.empty?
        requested = ids.map(&:to_i).to_set
        location_directory(practice: practice).each_with_object({}) do |location, paths|
          paths[location.fetch(:id).to_s] = location.fetch(:path) if requested.include?(location.fetch(:id).to_i)
        end
      end

      def location_directory(practice:, areas_by_location: {})
        records = Location.where(practice_id: practice.id).includes(:site, :children).order(:name, :id).to_a
        by_id = records.index_by(&:id)
        records.each { |location| location.association(:parent_location).target = by_id[location.parent_location_id] }
        records.map do |location|
          names = [ location.name ]
          parent = location.parent_location
          seen = [ location.id ]
          while parent && !seen.include?(parent.id)
            seen << parent.id
            names.unshift(parent.name)
            parent = parent.parent_location
          end
          names.unshift(location.site.name) if location.site
          { id: location.id.to_s, name: location.name, kind: location.kind, site_id: location.site_id&.to_s,
            parent_location_id: location.parent_location_id&.to_s, status: location.status, path: names.join(" / "), child_count: location.children.size,
            stock_destination: location.stock_destination?, address_line1: location.address_line1, address_line2: location.address_line2,
            city: location.city, state: location.state, postal_code: location.postal_code, country: location.country,
            areas: areas_by_location.fetch(location.id, []) }
        end
      end

      def supplier_pricing(practice:, actor:, **filters)
        result = SupplierPricingQuery.call(practice: practice, **filters)
        quote_requests = SupplierQuoteRequest.where(practice_id: practice.id).includes(:supplier, :product)
        quote_requests = quote_requests.where(supplier_id: result.supplier_id) if result.supplier_id.present?
        quote_requests = quote_requests.order(created_at: :desc, id: :desc).limit(26).to_a
        quote_requests_capped = quote_requests.length > 25
        context(practice: practice, actor: actor).merge(
          supplier_page: { query: result.query, supplier_id: result.supplier_id, page: result.page, page_count: result.page_count,
            page_size: SupplierPricingQuery::PAGE_SIZE, total_count: result.total_count, filtered_count: result.filtered_count },
          products: result.offers.filter_map(&:product).uniq(&:id).map { |product| { id: product.id.to_s, name: product.name, ndc: product.ndc.to_s, preferred_supplier_id: product.preferred_supplier_id&.to_s } },
          suppliers: Supplier.where(practice_id: practice.id).order(:name, :id).map { |supplier| { id: supplier.id.to_s, name: supplier.name } },
          supplier_products: result.offers.map { |row| supplier_product_wire(row, on: practice.inventory_date) },
          quote_requests: quote_requests.first(25).map { |request| supplier_quote_request_wire(request) },
          quote_requests_capped: quote_requests_capped)
      end

      def supplier_quote_request_wire(request)
        { id: request.id.to_s, supplier_product_id: request.supplier_product_id.to_s, supplier_id: request.supplier_id.to_s,
          supplier_name: request.supplier.name, product_id: request.product_id.to_s, product_name: request.product.name,
          requested_packages: request.requested_packages.to_d.to_s("F"), note: request.note,
          status: request.status, request_key: request.request_key, created_at: request.created_at.iso8601,
          quote_reference: request.quote_reference, quoted_on: request.quoted_on&.iso8601 }
      end

      def supplier_product_wire(row, on:)
        reason = row.purchase_eligibility_reason(on: on)
        { id: row.id.to_s, supplier_id: row.supplier_id.to_s, supplier_name: row.supplier.name, product_id: row.product_id&.to_s,
          ndc: row.ndc, supplier_sku: row.supplier_sku, description: row.description, package_quantity: row.package_quantity.to_d.to_s("F"),
          wholesale_unit_cost: row.wholesale_unit_cost.to_d.to_s("F"), currency: row.currency, ordering_unit: row.ordering_unit,
          contract_status: row.contract_status, available: row.available, lead_time_days: row.lead_time_days, effective_date: row.effective_date&.iso8601,
          imported_at: row.imported_at.iso8601, updated_at: row.updated_at.iso8601(6), price_source: row.price_source,
          quote_reference: row.quote_reference, quoted_on: row.quoted_on&.iso8601,
          eligible: reason.nil?, eligibility_reason: reason }
      end

      def replenishment(practice:, actor:, **filters)
        result = CatalogQuery.replenishment(practice: practice, actor: actor, **filters)
        explanations = result.products.to_h do |product|
          shortage = product[:shortage_units].to_d
          packages = (shortage / product.package_size.to_d).ceil
          offer = nil
          offer_error = nil
          begin
            selected = PurchaseCartCheckout.select_offer(product: product, requested_packages: [ packages, 1 ].max.to_s)
            row = selected.supplier_product
            offer = { supplier_name: selected.supplier.name, supplier_product_id: row.id.to_s, supplier_id: row.supplier_id.to_s,
              package_quantity: row.package_quantity.to_d.to_s("F"), supplier_packages: selected.supplier_packages.to_s, unit_price: row.wholesale_unit_cost.to_d.to_s("F"), currency: row.currency, total_cost: selected.total_cost.to_s("F"),
              overage_units: selected.overage_units.to_s("F"), desired_units: selected.desired_units.to_s("F"), lead_time_days: row.lead_time_days }
          rescue ArgumentError => error
            offer_error = error.message
          end
          [ product.id.to_s, { available_units: product.available_quantity.to_d.to_s("F"), on_hand_units: product.on_hand_quantity.to_d.to_s("F"),
            unavailable_units: (product.on_hand_quantity.to_d - product.available_quantity.to_d).to_s("F"), incoming_units: product[:incoming_units].to_d.to_s("F"), pending_order_units: product[:pending_units].to_d.to_s("F"),
            draft_cart_packages: product[:draft_packages].to_d.to_s("F"), shortage_units: shortage.to_s("F"), suggested_packages: packages.to_s,
            rounded_units: (packages * product.package_size.to_d).to_s("F"), unit_mismatch_count: product[:unit_mismatch_count].to_i, offer: offer, offer_error: offer_error } ]
        end
        context(practice: practice, actor: actor).merge(
          plan_page: { query: result.query, mode: result.mode, page: result.page, page_count: result.page_count, page_size: CatalogQuery::TABLE_PAGE_SIZE,
            total_count: result.total_count, filtered_count: result.filtered_count, product_id: result.product_id }, explanations: explanations,
          products: result.products.map { |product| product_summary_wire(product, available: product.available_quantity, on_hand: product.on_hand_quantity, supplier_name: product.preferred_supplier&.name, supplier_id: product.preferred_supplier_id) },
          sites: practice.sites.order(:name, :id).map { |site| Clinic::FacilitySerializer.site(site) }, purchase_cart: result.cart ? purchase_cart_wire(result.cart) : nil)
      end

      def receiving_lot(practice:, product_id:, number:)
        product = PharmacyProduct.where(practice_id: practice.id).find(product_id)
        number = number.to_s.strip
        raise ArgumentError, "Enter a lot number of 1–100 characters." unless number.length.between?(1, 100)
        lot = Lot.where(practice_id: practice.id, product_id: product.id).find_by(number: number)
        return { lot: nil, recalls: [] } unless lot

        kinds = Hold.active.where(practice_id: practice.id).joins(:batch).where(clinic_pharmacy_batches: { lot_id: lot.id }).distinct.pluck(:kind)
        recalls = Recall.open_cases.where(practice_id: practice.id, product_id: product.id).joins(:recall_lots).where(clinic_inventory_recall_lots: { lot_id: lot.id }).order(id: :desc)
        if recalls.empty? && Recall.where(practice_id: practice.id, product_id: product.id).joins(:recall_lots).where(clinic_inventory_recall_lots: { lot_id: lot.id }).exists?
          raise ArgumentError, "This lot belongs to a closed recall. Open a new recall case before receiving it into quarantine."
        end
        { lot: { id: lot.id.to_s, product_id: product.id.to_s, package_id: "pkg_#{product.id}", lot_number: lot.number, expiration_date: lot.expires_on.iso8601,
            status: kinds.include?("recalled") ? "recalled" : kinds.any? ? "quarantined" : "active" },
          recalls: recalls.map { |recall| { id: recall.id.to_s, product_id: product.id.to_s, lot_numbers: [ lot.number ], reference: recall.reference, required_disposition: recall.required_disposition } } }
      end

      def delivery_intake(practice:, actor:, **filters)
        result = ReceivingQuery.intake(practice: practice, **filters)
        order_option = ->(order) { { id: order.id.to_s, number: order.number, status: order.status, supplier: order.supplier&.name, destination: order.destination } }
        selected = result.selected
        context(practice: practice, actor: actor).merge(
          intake_page: { query: result.query, page: result.page, page_count: result.page_count, page_size: ReceivingQuery::PAGE_SIZE,
            total_count: result.total_count, filtered_count: result.filtered_count, selected_order_id: selected&.id&.to_s },
          order_options: result.orders.map(&order_option),
          selected_order: selected && order_option.call(selected).merge(lines: selected.lines.map do |line|
            allocated = result.allocations.fetch(line.id, 0).to_d
            { id: line.id.to_s, product_id: line.product_id.to_s, product_name: line.product_name, stock_unit: line.stock_unit,
              ordered_packages: line.ordered_quantity.to_d.to_s("F"), received_packages: line.received_quantity.to_d.to_s("F"),
              allocated_packages: allocated.to_s("F"), available_packages: [ line.remaining_quantity - allocated, 0.to_d ].max.to_s("F"),
              units_per_package: line.conversion_factor.to_d.to_s("F") }
          end))
      end

      def receiving(practice:, actor:, **filters)
        result = ReceivingQuery.call(practice: practice, **filters)
        selected = result.selected && Shipment.where(practice_id: practice.id).includes(:reconciliation, :shipment_lines,
          { shipment_events: :recorded_by_membership }, { receipts: { lines: { batch: :lot } } },
          { purchase_order: [ :supplier, { lines: :product } ] }).find(result.selected.id)
        order = selected&.purchase_order
        products = order ? order.lines.map(&:product).uniq(&:id) : []
        receipts = selected ? selected.receipts.to_a : []
        lots = receipts.flat_map { |receipt| receipt.lines.map { |line| line.batch.lot } }.uniq(&:id)
        kinds_by_lot = Hold.active.where(practice_id: practice.id).joins(:batch).where(clinic_pharmacy_batches: { lot_id: lots.map(&:id) })
          .group("clinic_pharmacy_batches.lot_id").pluck("clinic_pharmacy_batches.lot_id", Arel.sql("array_agg(DISTINCT clinic_inventory_holds.kind)")).to_h
        context(practice: practice, actor: actor).merge(
          delivery_page: { query: result.query, status: result.status, page: result.page, page_count: result.page_count, page_size: ReceivingQuery::PAGE_SIZE,
            total_count: result.total_count, filtered_count: result.filtered_count, selected_shipment_id: selected&.id&.to_s },
          delivery_options: result.rows.map { |shipment| { id: shipment.id.to_s, supplier_reference: shipment.supplier_reference, order_number: shipment[:order_number], supplier_name: shipment[:supplier_name], status: shipment[:receiving_state] } },
          shipments: selected ? [ shipment_wire(selected) ] : [], purchase_orders: order ? [ purchase_order_wire(order) ] : [],
          products: products.map { |product| { id: product.id.to_s, name: product.name, base_unit: product.stock_unit } }, packages: products.map { |product| package_wire(product) },
          receipts: receipts.map { |receipt| receipt_wire(receipt) },
          lots: lots.map do |lot|
            kinds = kinds_by_lot.fetch(lot.id, [])
            { id: lot.id.to_s, product_id: lot.product_id.to_s, package_id: "pkg_#{lot.product_id}", lot_number: lot.number, expiration_date: lot.expires_on.iso8601,
              status: kinds.include?("recalled") ? "recalled" : kinds.any? ? "quarantined" : "active" }
          end, recalls: [],
          locations: location_directory(practice: practice))
      end

      def purchasing(practice:, actor:, **filters)
        result = PurchaseOrdersQuery.call(practice: practice, **filters)
        products = result.orders.flat_map { |order| order.lines.map(&:product) }.uniq(&:id)
        deliveries = Shipment.where(practice_id: practice.id, purchase_order_id: result.orders.map(&:id))
          .includes(:receipts, :reconciliation, :shipment_lines, { shipment_events: :recorded_by_membership })
          .order(:purchase_order_id, id: :desc)
        context(practice: practice, actor: actor).merge(
          order_page: { query: result.query, status: result.status, page: result.page, page_count: result.page_count, page_size: PurchaseOrdersQuery::PAGE_SIZE,
            total_groups: result.total_groups, filtered_groups: result.filtered_groups, total_orders: result.total_orders, matching_orders: result.matching_orders },
          purchase_orders: result.orders.map { |order| purchase_order_wire(order) },
          products: products.map { |product| { id: product.id.to_s, name: product.name, ndc: product.ndc.to_s, base_unit: product.stock_unit } },
          shipments: deliveries.map { |shipment| shipment_wire(shipment) })
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
          locations: location_directory(practice: practice, areas_by_location: areas))
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
          items: cart.items.select { |item| item.status == "draft" }.map do |item|
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
        { id: "bal_#{batch.id}", product_id: batch.product_id.to_s, lot_id: batch.lot_id.to_s, location_id: batch.location_id.to_s, recall_ids: recall_ids, transferable: batch.transferable?, on_hand_units: batch.quantity.to_d.to_s("F"), held_units: held.to_d.to_s("F"), blocked_units: blocked.to_d.to_s("F"), quarantined_units: quarantined.to_d.to_s("F"), available_units: batch_available?(batch, active_holds, inventory_date) ? batch.quantity.to_d.to_s("F") : "0" }
      end

      def movement_wire(movement)
        quantity = movement.quantity.to_d
        receipt = movement.receipt_line&.receipt
        administration = movement.medication_administration_movement&.medication_administration
        type = movement.kind
        source = if receipt
          { kind: "receipt", label: "Recorded receipt" }
        elsif administration
          encounter = administration.encounter
          { kind: "medication_administration", label: "Medication administration",
            href: "/clinic/patients/#{encounter.patient_id}/encounters/#{encounter.id}" }
        else
          { kind: "inventory_movement", label: movement.kind.to_s.humanize }
        end
        { id: movement.id.to_s, type: type, lot_id: movement.batch.lot_id.to_s, location_id: movement.batch.location_id.to_s,
          reverses_entry_id: movement.reverses_entry_id&.to_s,
          quantity_units: quantity.abs.to_s("F"), direction: quantity.negative? ? "out" : "in",
          source: source,
          occurred_at: movement.occurred_at.iso8601, actor_id: movement.actor_id&.to_s,
          actor_name: movement.actor && movement.actor.email_address.split("@").first.tr("._-", " ").titleize,
          reason: movement.reason }
      end

      def purchase_order_wire(order)
        { id: order.id.to_s, number: order.number, status: order.status, supplier: order.supplier&.name, checkout_group_id: order.checkout_group_id, destination: order.destination, receiving_site_id: order.receiving_site_id&.to_s, destination_address: order.destination_address, created_at: order.created_at.iso8601, lines: order.lines.map { |line| { id: line.id.to_s, product_id: line.product_id.to_s, package_id: package_wire(line.product)[:id], product_name: line.product_name, stock_unit: line.stock_unit, input_unit: line.input_unit, ordered_packages: line.ordered_quantity.to_d.to_s("F"), units_per_package: line.conversion_factor.to_d.to_s("F"), ordered_units: line.ordered_units.to_d.to_s("F"), package_price: line.unit_price.to_d.to_s("F"), currency: line.currency, quote_reference: line.quote_reference, quoted_on: line.quoted_on&.iso8601, received_units: line.received_units.to_d.to_s("F"), received_packages: line.received_quantity.to_d.to_s("F") } }, subtotal: order.subtotal.to_d.to_s("F"), tax: order.tax.to_d.to_s("F"), shipping: order.shipping.to_d.to_s("F"), total: order.total.to_d.to_s("F"), cancelled_remaining_units: order.status == "cancelled" ? order.lines.sum { |line| line.remaining_quantity.to_d }.to_s("F") : "0" }
      end

      def shipment_wire(shipment)
        { id: shipment.id.to_s, po_id: shipment.purchase_order_id.to_s, supplier_reference: shipment.supplier_reference,
          carrier: shipment.carrier, tracking_number: shipment.tracking_number, status: shipment.effective_status,
          allowed_next_statuses: shipment.allowed_next_statuses, package_count: shipment.package_count,
          delivered_at: shipment.effective_delivered_at&.iso8601, expected_units: shipment.expected_units.to_d.to_s("F"),
          events: shipment.shipment_events.map { |event| shipment_event_wire(event) },
          reconciliation: shipment.reconciliation&.then { |record| { id: record.id.to_s, accepted_packages: record.accepted_packages.to_d.to_s("F"), missing_packages: record.missing_packages.to_d.to_s("F"), rejected_packages: record.rejected_packages.to_d.to_s("F"), excess_packages: record.excess_packages.to_d.to_s("F"), exception: record.exception, reason: record.reason, observations: record.observations, actor_id: record.actor_id.to_s, recorded_at: record.created_at.iso8601 } },
          allocations: shipment.shipment_lines.map { |line| { purchase_order_line_id: line.purchase_order_line_id.to_s, expected_packages: line.expected_packages.to_d.to_s("F") } } }
      end

      def shipment_event_wire(event)
        { id: event.id.to_s, status: event.status, note: event.note, recorded_at: event.recorded_at.iso8601,
          recorded_by_membership_id: event.recorded_by_membership_id.to_s }
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
        active_holds.empty? && batch.expires_on >= inventory_date && batch.product.active? && batch.location_record.stock_destination?
      end

      def count_wire(count, reviews: nil)
        reviews ||= ControlReview.where(practice_id: count.practice_id, count_id: count.id).order(:id).to_a
        investigation = reviews.reverse.find { |review| review.kind == "investigation" }
        certification = reviews.reverse.find { |review| review.kind == "certification" }
        settled_expected = count.expected_quantity.to_d
        variance = count.observed_quantity.to_d - settled_expected
        { id: "recon_#{count.id}", count_id: count.id.to_s, product_id: count.batch.product_id.to_s, lot_id: count.batch.lot_id.to_s, location_id: count.batch.location_id.to_s, status: certification ? "certified" : investigation ? "resolved" : "variance_review", expected_units: settled_expected.to_d.to_s("F"), counted_units: count.observed_quantity.to_d.to_s("F"), variance_units: variance.to_s("F"), counted_at: count.created_at.iso8601, counter_id: count.actor_id.to_s, investigation_required: variance.nonzero? && investigation.nil?, investigation_note: investigation&.reason, certified_at: certification&.created_at&.iso8601, certified_by: certification&.actor_id&.to_s }
      end

      def audit_wire(event)
        { id: event.id.to_s, action: event.action_code, actor_id: event.actor_session_reference.to_s.sub(/^user:/, ""), entity_id: event.resource_manifests.first&.protected_resource_version_ref, occurred_at: event.occurred_at.iso8601 }
      end
    end
  end
end
