module Clinic
  module Assistant
    module Workflows
      class Operations
        PAGE = { key: "page", label: "Page", type: "number", required: false }.freeze
        QUERY = { key: "query", label: "Search", type: "text", required: false }.freeze
        DATE = { key: "date", label: "Date", type: "date", required: true }.freeze
        READS = {
          "billing.dashboard" => [ "Billing overview", "Billing", [ QUERY, PAGE ] ],
          "billing.patient_ledger" => [ "Selected patient ledger", "Billing", [] ],
          "billing.invoices" => [ "Selected patient invoices", "Billing", [ PAGE ] ],
          "billing.invoice" => [ "Invoice details", "Billing", [ { key: "invoice", label: "Invoice", type: "record", required: true } ] ],
          "billing.services" => [ "Billing service catalog", "Billing", [ QUERY, PAGE ] ],
          "billing.cash_drawers" => [ "Selected site cash drawers", "Billing", [ PAGE ] ],
          "billing.estimates" => [ "Selected patient estimate drafts and history", "Billing", [ PAGE ] ],
          "inventory.catalog" => [ "Inventory catalog", "Inventory", [ QUERY, PAGE ] ],
          "inventory.positions" => [ "Stock positions and lots", "Inventory", [ QUERY, PAGE ] ],
          "inventory.activity" => [ "Stock movement history", "Inventory", [ QUERY ] ],
          "inventory.replenishment" => [ "Replenishment planning", "Inventory", [ QUERY, PAGE ] ],
          "inventory.purchase_orders" => [ "Purchase order drafts and history", "Inventory", [ QUERY, PAGE ] ],
          "inventory.receiving" => [ "Receiving worklist", "Inventory", [ QUERY, PAGE ] ],
          "inventory.exceptions" => [ "Inventory exceptions", "Inventory", [ QUERY, PAGE ] ],
          "inventory.locations" => [ "Inventory locations", "Inventory", [ QUERY, PAGE ] ],
          "inventory.recalls" => [ "Inventory recall cases", "Inventory", [ QUERY, PAGE ] ],
          "inventory.controlled_counts" => [ "Controlled count review queue", "Inventory", [ QUERY, PAGE ] ],
          "inventory.count_sessions" => [ "Inventory count sessions", "Inventory", [ QUERY, PAGE ] ],
          "workforce.schedules" => [ "Selected site schedules", "Workforce", [ PAGE ] ],
          "workforce.schedule_draft" => [ "Staff schedule draft and validation", "Workforce", [ { key: "draft", label: "Schedule draft", type: "record", required: true } ] ],
          "workforce.requests" => [ "Availability, time off and shift requests", "Workforce", [ PAGE ] ],
          "workforce.timecards" => [ "Recorded timecards", "Workforce", [ PAGE ] ],
          "workforce.employments" => [ "Employment and access directory", "Workforce", [ PAGE ] ],
          "workforce.settings" => [ "Effective workforce settings", "Workforce", [] ],
          "facilities.site" => [ "Selected site and operating hours", "Facilities", [] ],
          "facilities.rooms" => [ "Selected site rooms", "Facilities", [ QUERY, PAGE ] ],
          "facilities.departments" => [ "Clinic departments", "Facilities", [ QUERY, PAGE ] ],
          "facilities.visit_types" => [ "Available visit types", "Facilities", [ QUERY, PAGE ] ],
          "operations.follow_ups" => [ "Operational follow-up worklist", "Operations", [ PAGE ] ],
          "operations.recalls" => [ "Patient recall worklist", "Operations", [] ],
          "operations.callbacks" => [ "Patient callback requests", "Operations", [ PAGE ] ],
          "operations.configuration" => [ "Clinic configuration review", "Operations", [] ],
          "operations.encounter_follow_up" => [ "Selected encounter follow-up", "Operations", [] ],
          "schedule.calendar" => [ "Selected site daily calendar", "Schedule", [ DATE ] ],
          "schedule.waitlist" => [ "Selected patient waitlist", "Schedule", [] ],
          "reports.daily_visits" => [ "Daily visits by state", "Reports", [ DATE, PAGE ] ],
          "reports.daily_invoices" => [ "Daily invoices", "Reports", [ DATE, PAGE ] ],
          "reports.daily_payments" => [ "Daily payment and refund activity", "Reports", [ DATE, PAGE ] ],
          "reports.daily_drawers" => [ "Daily cash drawers", "Reports", [ DATE, PAGE ] ],
          "reports.daily_stock" => [ "Daily stock movements", "Reports", [ DATE, PAGE ] ],
          "reports.current_stock" => [ "Current stock report", "Reports", [ PAGE ] ],
          "reports.open_work" => [ "Open clinical work summary", "Reports", [] ],
          "reports.payment_collection" => [ "Payment collection activity", "Reports", [] ],
          "reports.reminder_delivery" => [ "Reminder delivery activity", "Reports", [] ],
          "reports.scribe" => [ "Scribe activity", "Reports", [ PAGE ] ],
          "reports.prescription_simulator" => [ "Prescription simulator activity", "Reports", [] ],
          "reports.day_end_preview" => [ "Day-end source comparison", "Reports", [ DATE ] ]
        }.freeze
        CHANGES = {
          "billing.create_service" => [ "Create a billing service", "Billing", [
            { key: "name", label: "Service name", type: "text", required: true },
            { key: "code", label: "Service code", type: "text", required: false },
            { key: "description", label: "Description", type: "text", required: false },
            { key: "unit_amount", label: "Exact unit amount", type: "text", required: true },
            { key: "currency", label: "Currency", type: "text", required: true }
          ], "Adds a service to the clinic billing catalog with its recorded exact price." ],
          "billing.update_service" => [ "Update a billing service price", "Billing", [
            { key: "service", label: "Billing service", type: "record", required: true },
            { key: "unit_amount", label: "Exact unit amount", type: "text", required: true }
          ], "Updates the selected catalog service price using its current revision." ],
          "billing.draft_estimate" => [ "Draft a cash-pay estimate", "Billing", [
            { key: "service", label: "Billing service", type: "record", required: true },
            { key: "quantity", label: "Exact quantity", type: "text", required: true }
          ], "Creates a general estimate draft. Issuance, good-faith-estimate classification and delivery remain human workflows." ],
          "billing.record_cash" => [ "Record a local cash payment", "Billing", [
            { key: "invoice", label: "Posted invoice", type: "record", required: true },
            { key: "drawer", label: "Open cash drawer", type: "record", required: true },
            { key: "tendered_amount", label: "Exact cash tendered", type: "text", required: true },
            { key: "allocation_amount", label: "Exact invoice allocation", type: "text", required: true }
          ], "Records cash received against the selected patient's posted invoice and creates its receipt." ],
          "billing.refund_cash" => [ "Record a local cash refund", "Billing", [
            { key: "payment", label: "Recorded cash payment", type: "record", required: true },
            { key: "amount", label: "Exact refund amount", type: "text", required: true },
            { key: "reason", label: "Refund reason", type: "text", required: true }
          ], "Records a cash refund in the payment's open drawer without calling a payment provider." ],
          "billing.credit_invoice" => [ "Credit an invoice", "Billing", [
            { key: "invoice", label: "Posted invoice", type: "record", required: true },
            { key: "amount", label: "Exact credit amount", type: "text", required: true },
            { key: "reason", label: "Credit reason", type: "text", required: true }
          ], "Records a credit through the existing invoice adjustment policy." ],
          "billing.write_off_invoice" => [ "Write off an unpaid invoice balance", "Billing", [
            { key: "invoice", label: "Posted invoice", type: "record", required: true },
            { key: "amount", label: "Exact write-off amount", type: "text", required: true },
            { key: "reason", label: "Write-off reason", type: "text", required: true }
          ], "Records an attributable write-off within the invoice's current unpaid balance." ],
          "inventory.receive_stock" => [ "Record received inventory", "Inventory", [
            { key: "product", label: "Catalog product", type: "record", required: true },
            { key: "location", label: "Receiving bin", type: "record", required: true },
            { key: "lot_number", label: "Lot number", type: "text", required: true },
            { key: "expires_on", label: "Lot expiry", type: "date", required: true },
            { key: "quantity", label: "Exact packages received", type: "text", required: true },
            { key: "supplier", label: "Recorded supplier name", type: "text", required: false },
            { key: "reason", label: "Receiving reason", type: "text", required: true }
          ], "Records a one-line delivery in package units with unknown cost. Recall and receiving restrictions remain enforced." ],
          "inventory.transfer_stock" => [ "Transfer inventory between bins", "Inventory", [
            { key: "batch", label: "Source stock position", type: "record", required: true },
            { key: "location", label: "Destination bin", type: "record", required: true },
            { key: "quantity", label: "Exact stock units", type: "text", required: true },
            { key: "reason", label: "Transfer reason", type: "text", required: true }
          ], "Records balanced stock movement within the selected site; held, expired and recalled stock remain protected." ],
          "inventory.adjust_stock" => [ "Record an inventory adjustment", "Inventory", [
            { key: "batch", label: "Stock position", type: "record", required: true },
            { key: "kind", label: "Adjustment kind", type: "select", required: true, options: %w[adjustment_in adjustment_out damaged expired] },
            { key: "quantity", label: "Exact stock units", type: "text", required: true },
            { key: "reason", label: "Adjustment reason", type: "text", required: true }
          ], "Posts an attributable local stock adjustment under the existing quantity, permission and ledger constraints." ],
          "inventory.hold_stock" => [ "Place an inventory safety hold", "Inventory", [
            { key: "batch", label: "Stock position", type: "record", required: true },
            { key: "kind", label: "Hold kind", type: "select", required: true, options: %w[quarantined temperature damaged] },
            { key: "reason", label: "Hold reason", type: "text", required: true }
          ], "Places a recorded safety hold. Release and recall disposition require their separate review workflows." ],
          "inventory.draft_purchase_order" => [ "Draft a purchase order", "Inventory", [
            { key: "product", label: "Catalog product", type: "record", required: true },
            { key: "supplier_record", label: "Supplier", type: "record", required: true },
            { key: "quantity", label: "Exact packages", type: "text", required: true },
            { key: "unit_price", label: "Recorded exact price per package", type: "text", required: true },
            { key: "currency", label: "Currency", type: "text", required: true },
            { key: "reason", label: "Order reason", type: "text", required: true }
          ], "Creates a local draft with operator-recorded price at the selected site's recorded shipping address. Does not submit, approve or send an order." ],
          "inventory.create_location" => [ "Create a stock bin", "Inventory", [
            { key: "name", label: "Bin name", type: "text", required: true },
            { key: "kind", label: "Bin kind", type: "select", required: true, options: %w[storage quarantine returns controlled] }
          ], "Creates an active bin at the selected site using the existing inventory configuration policy." ],
          "inventory.rename_location" => [ "Rename a stock bin", "Inventory", [
            { key: "location", label: "Stock bin", type: "record", required: true },
            { key: "name", label: "New bin name", type: "text", required: true }
          ], "Renames a bin only when the existing operation permits its recorded history to remain valid." ],
          "workforce.create_schedule_draft" => [ "Create a staff schedule draft", "Workforce", [
            { key: "week_start_on", label: "Week starting Monday", type: "date", required: true },
            { key: "template", label: "Schedule template", type: "record", required: false }
          ], "Creates an unpublished draft for the selected site, optionally copying its current template. Publication requires human review." ],
          "workforce.add_shift" => [ "Add a shift to a schedule draft", "Workforce", [
            { key: "draft", label: "Schedule draft", type: "record", required: true },
            { key: "employment", label: "Employee", type: "record", required: true },
            { key: "local_start", label: "Local start (YYYY-MM-DDTHH:MM)", type: "text", required: true },
            { key: "local_end", label: "Local end (YYYY-MM-DDTHH:MM)", type: "text", required: true },
            { key: "start_occurrence", label: "Start occurrence", type: "select", required: true, options: %w[only first second] },
            { key: "end_occurrence", label: "End occurrence", type: "select", required: true, options: %w[only first second] },
            { key: "role_name", label: "Role", type: "text", required: false },
            { key: "break_minutes", label: "Break minutes", type: "number", required: false }
          ], "Adds one local-time shift to an unpublished draft using the existing time-zone and revision rules. Publication remains separate." ],
          "billing.draft_invoice" => [ "Draft an invoice", "Billing", [
            { key: "service", label: "Billing service", type: "record", required: true },
            { key: "quantity", label: "Exact quantity", type: "text", required: true }
          ], "Creates one catalog-backed draft invoice for the selected patient. Posting and collection require human review." ],
          "inventory.observe_count" => [ "Record a count observation", "Inventory", [
            { key: "batch", label: "Stock position", type: "record", required: true },
            { key: "quantity", label: "Exact counted units", type: "text", required: true },
            { key: "reason", label: "Observation reason", type: "text", required: true }
          ], "Records an attributable count observation. Approval and stock correction remain separate human actions." ],
          "operations.review_callback" => [ "Start reviewing a callback", "Operations", [
            { key: "callback", label: "Pending callback", type: "record", required: true },
            { key: "note", label: "Review note", type: "text", required: false }
          ], "Moves the selected patient's pending callback to in review without sending a message or claiming contact occurred." ],
          "operations.plan_follow_up" => [ "Record an encounter follow-up plan", "Operations", [
            { key: "plan", label: "Follow-up plan", type: "text", required: true },
            { key: "due_at", label: "Due at", type: "datetime", required: false }
          ], "Records a needed follow-up for the selected encounter. Does not complete it or book an appointment." ]
        }.freeze
        PATIENT_KEYS = %w[billing.patient_ledger billing.invoices billing.invoice billing.draft_invoice billing.draft_estimate billing.estimates
          billing.record_cash billing.refund_cash billing.credit_invoice billing.write_off_invoice
          operations.callbacks operations.review_callback schedule.waitlist operations.encounter_follow_up operations.plan_follow_up].freeze
        ENCOUNTER_KEYS = %w[operations.encounter_follow_up operations.plan_follow_up].freeze
        INVENTORY_METHODS = {
          "inventory.catalog" => :catalog, "inventory.positions" => :positions,
          "inventory.activity" => :activity, "inventory.replenishment" => :replenishment,
          "inventory.purchase_orders" => :purchasing, "inventory.receiving" => :receiving,
          "inventory.exceptions" => :exceptions, "inventory.locations" => :locations,
          "inventory.recalls" => :recall_cases, "inventory.controlled_counts" => :controlled_counts,
          "inventory.count_sessions" => :count_sessions
        }.freeze
        REPORT_QUERIES = {
          "reports.daily_invoices" => Clinic::Reports::DailyInvoices,
          "reports.daily_stock" => Clinic::Reports::DailyStockMovements,
          "reports.payment_collection" => Clinic::Reports::PaymentCollectionActivity,
          "reports.reminder_delivery" => Clinic::Reports::ReminderDeliveryActivity,
          "reports.prescription_simulator" => Clinic::Reports::PrescriptionSimulatorActivity
        }.freeze

        def self.definitions
          READS.map do |key, (title, domain, fields)|
            definition(key, title, domain, fields, "read", "Read current authorized source records for #{title.downcase}.")
          end + CHANGES.map do |key, (title, domain, fields, description)|
            definition(key, title, domain, fields, "change", description)
          end
        end

        def self.definition(key, title, domain, fields, kind, description)
          { key:, title:, domain:, description:, kind:, fields:,
            patient_required?: PATIENT_KEYS.include?(key), encounter_required?: ENCOUNTER_KEYS.include?(key) }
        end
        private_class_method :definition

        def initialize(practice:, actor:, site:, patient:, encounter:)
          @practice, @actor, @site, @patient, @encounter = practice, actor, site, patient, encounter
        end

        def authorize!(key:, inputs:)
          known!(key)
          case key
          when "billing.services"
            action = %w[billing.catalog.manage billing.read billing.invoice_draft billing.write].find { |code| ability.allowed_permission?(code) }
            authorize(action || "billing.read")
          when "billing.create_service", "billing.update_service"
            authorize("billing.catalog.manage")
          when "billing.draft_invoice", "billing.draft_estimate"
            authorize("billing.invoice_draft", legacy: "billing.write")
          when "billing.record_cash", "billing.refund_cash"
            authorize("billing.payment_record", legacy: "billing.write")
          when "billing.cash_drawers"
            action = %w[billing.payment_record billing.write billing.cash_reconcile].find { |code| ability.allowed_permission?(code) }
            authorize(action || "billing.cash_reconcile")
          when "billing.credit_invoice", "billing.write_off_invoice"
            authorize("billing.invoice_post", legacy: "billing.write")
          when /^billing\./, "reports.daily_invoices", "reports.daily_payments", "reports.payment_collection"
            authorize("billing.read", legacy: "billing.write")
          when /^inventory\./, "reports.current_stock", "reports.daily_stock"
            authorize("inventory.read")
            authorize("procurement.read") if %w[inventory.purchase_orders inventory.replenishment].include?(key)
            authorize("recall.read") if key == "inventory.recalls"
            authorize("controlled.read") if key == "inventory.controlled_counts"
            authorize("inventory.count") if key == "inventory.observe_count"
            action = { "inventory.receive_stock" => "inventory.receive", "inventory.adjust_stock" => "inventory.adjust",
              "inventory.transfer_stock" => "inventory.transfer", "inventory.hold_stock" => "inventory.hold",
              "inventory.draft_purchase_order" => "procurement.create", "inventory.create_location" => "inventory.configure",
              "inventory.rename_location" => "inventory.configure" }[key]
            authorize(action) if action
            if CHANGES.key?(key) && !%w[inventory.create_location inventory.rename_location inventory.draft_purchase_order].include?(key)
              profile = practice.inventory_profiles.order(version: :desc).first
              unless profile && %w[configured synthetic].include?(profile.status) && profile.capabilities.include?("inventory")
                raise Clinic::Assistant::WorkflowRegistry::Gated, "Inventory posting is suspended or not configured. History remains available."
              end
            end
          when /^facilities\./
            authorize("facilities.read", legacy: "appointments.book", selected_site: true)
          when "workforce.schedules"
            workforce.authorize!("workforce.schedule.read", site: site)
            schedule_enabled!
          when "workforce.schedule_draft", "workforce.create_schedule_draft", "workforce.add_shift"
            workforce.authorize!("workforce.schedule.manage", site: site)
            schedule_enabled!
          when "workforce.requests"
            workforce.authorize!("workforce.requests.review", site: site)
          when "workforce.timecards"
            workforce.authorize!("workforce.timecards.read", site: site)
          when "workforce.employments", "workforce.settings"
            workforce.authorize!("workforce.admin")
          when "operations.configuration"
            authorize("facilities.write")
          when "operations.follow_ups"
            member = Clinic::Messaging::StaffPolicy.member_for!(practice:, actor:)
            allowed = ability.allowed_permission?("staff_messaging.read", site:) ||
              (ability.allowed_permission?("patients.read", site:) && ability.allowed_permission?("encounters.write", site:)) ||
              ability.practice_scope_for?("billing.read") || ability.practice_scope_for?("billing.write")
            raise Clinic::Authorization::Denied unless member && allowed
          when "operations.recalls", "operations.encounter_follow_up", "operations.plan_follow_up", "reports.open_work"
            authorize("patients.read", selected_site: true)
            authorize("encounters.write", selected_site: true)
          when "operations.review_callback"
            authorize("appointments.write")
          when "schedule.waitlist"
            Clinic::Scheduling::Waitlist.authorize!(practice:, actor:, site:)
          when "schedule.calendar", "operations.callbacks", "reports.daily_visits"
            authorize("appointments.read", selected_site: true)
          when "reports.daily_drawers"
            action = %w[billing.payment_record billing.write billing.cash_reconcile].find { |code| ability.allowed_permission?(code) }
            authorize(action || "billing.cash_reconcile")
          when "reports.day_end_preview"
            Clinic::Reports::RecordDayEndReview.authorize!(practice:, actor:)
            authorize("appointments.read", selected_site: true)
          when "reports.reminder_delivery" then authorize("reminders.read")
          when "reports.scribe" then authorize("scribe.read", any_site: true)
          when "reports.prescription_simulator" then authorize("clinical_records.read")
          end
          true
        end

        def options(key:, field:, query:, inputs:)
          authorize!(key:, inputs:)
          search = query.to_s.strip
          raise ArgumentError, "Search must be 100 characters or fewer." if search.length > 100

          scope, label = case [ key, field ]
          when [ "billing.draft_invoice", "service" ], [ "billing.draft_estimate", "service" ], [ "billing.update_service", "service" ]
            [ practice.billing_services.where(active: true).order(:name, :id), ->(item) { "#{item.name} — #{item.unit_amount.to_s('F')} #{item.currency}" } ]
          when [ "billing.invoice", "invoice" ], [ "billing.record_cash", "invoice" ],
            [ "billing.credit_invoice", "invoice" ], [ "billing.write_off_invoice", "invoice" ]
            require_patient!
            scope = practice.invoices.where(patient_id: patient.id)
            scope = scope.where(status: "posted") unless key == "billing.invoice"
            [ scope.order(created_at: :desc, id: :desc), ->(item) { "#{item.status.humanize} invoice — #{item.currency}, #{item.created_at.to_date.iso8601}" } ]
          when [ "billing.record_cash", "drawer" ]
            [ practice.cash_drawer_sessions.where(site:, status: "open").where.not(currency: nil).order(:id), ->(item) { "#{site.name} — #{item.currency}, opened #{item.created_at.to_date.iso8601}" } ]
          when [ "billing.refund_cash", "payment" ]
            require_patient!
            [ Clinic::PaymentEvent.where(practice:, patient:).joins(:cash_tender).where(clinic_cash_tenders: {
              cash_drawer_session_id: practice.cash_drawer_sessions.where(site:, status: "open").select(:id) }).order(created_at: :desc, id: :desc),
              ->(item) { "#{item.amount.to_s('F')} #{item.currency} cash — #{item.created_at.to_date.iso8601}" } ]
          when [ "inventory.observe_count", "batch" ], [ "inventory.transfer_stock", "batch" ],
            [ "inventory.adjust_stock", "batch" ], [ "inventory.hold_stock", "batch" ]
            [ batch_scope.includes(:product, :location_record).order(:expires_on, :id), ->(item) { "#{item.product.name} — lot #{item.lot_number}, #{item.location_record.name}, #{item.product.stock_unit}" } ]
          when [ "inventory.receive_stock", "product" ], [ "inventory.draft_purchase_order", "product" ]
            [ practice.pharmacy_products.where(active: true).order(:name, :id), ->(item) { "#{item.name} — package #{item.package_size.to_s('F')} #{item.stock_unit}" } ]
          when [ "inventory.receive_stock", "location" ], [ "inventory.transfer_stock", "location" ], [ "inventory.rename_location", "location" ]
            [ location_scope.order(:name, :id), ->(item) { "#{item.name} — #{item.kind || 'storage'}" } ]
          when [ "inventory.draft_purchase_order", "supplier_record" ]
            [ practice.inventory_suppliers.order(:name, :id), ->(item) { item.name } ]
          when [ "operations.review_callback", "callback" ]
            require_patient!
            [ callback_scope.where(status: "pending").order(:requested_at, :id), ->(item) { "#{item.requested_at.to_date.iso8601} — #{item.content.to_s.truncate(120)}" } ]
          when [ "workforce.schedule_draft", "draft" ], [ "workforce.add_shift", "draft" ]
            [ Clinic::Workforce::ScheduleDraft.where(practice:, site:, status: "draft").order(week_start_on: :desc), ->(item) { "Week of #{item.week_start_on.iso8601} — revision #{item.revision}" } ]
          when [ "workforce.create_schedule_draft", "template" ]
            [ Clinic::Workforce::ScheduleTemplate.where(practice:, site:, active: true).order(:name, :id), ->(item) { "#{item.name} — #{item.timezone}, revision #{item.revision}" } ]
          when [ "workforce.add_shift", "employment" ]
            [ Clinic::Workforce::Employment.where(practice:).joins(:employment_sites).where(clinic_workforce_employment_sites: { site_id: site.id })
              .includes(:staff_member, :employment_sites, membership: :user).distinct.order(:id), ->(item) { item.staff_member.display_name } ]
          else
            raise ArgumentError, "This workflow has no such record choice."
          end
          scope.limit(100).filter_map do |record|
            text = label.call(record)
            next unless search.empty? || text.downcase.include?(search.downcase)

            { record_type: record.class.name, record_id: record.id, label: text, version: ContextRegistry.record_version(record) }
          end.first(30)
        end

        def resolve(key:, inputs:)
          known!(key)
          validate_context!
          resolved = inputs.stringify_keys.dup
          require_patient! if PATIENT_KEYS.include?(key)
          require_encounter! if ENCOUNTER_KEYS.include?(key)
          resolved["page"] = Integer(inputs.fetch("page", 1).presence || 1)
          raise ArgumentError, "Page must be between 1 and 10000." unless resolved["page"].between?(1, 10_000)
          resolved["query"] = inputs["query"].to_s.strip
          raise ArgumentError, "Search must be 100 characters or fewer." if resolved["query"].length > 100
          resolved["_date"] = Date.iso8601(inputs.fetch("date")) if READS.fetch(key, [ nil, nil, [] ])[2].any? { |field| field[:key] == "date" }
          case key
          when "billing.invoice", "billing.record_cash", "billing.credit_invoice", "billing.write_off_invoice"
            scope = practice.invoices.where(patient_id: patient.id)
            scope = scope.where(status: "posted") unless key == "billing.invoice"
            resolved["_invoice"] = choice!(inputs.fetch("invoice"), scope)
            if key == "billing.record_cash"
              resolved["_drawer"] = choice!(inputs.fetch("drawer"), practice.cash_drawer_sessions.where(site:, status: "open"))
              %w[tendered_amount allocation_amount].each { |name| resolved[name] = money!(inputs.fetch(name), name:, positive: true) }
            elsif key != "billing.invoice"
              resolved["amount"] = money!(inputs.fetch("amount"), name: "amount", positive: true)
              resolved["reason"] = text!(inputs.fetch("reason"), maximum: 500)
            end
          when "billing.draft_invoice", "billing.draft_estimate", "billing.update_service"
            service = choice!(inputs.fetch("service"), practice.billing_services.where(active: true))
            resolved["_service"] = service
            if key == "billing.update_service"
              resolved["unit_amount"] = money!(inputs.fetch("unit_amount"), name: "unit amount")
            else
              resolved["quantity"] = Clinic::Billing::Money.decimal(inputs.fetch("quantity"), name: "quantity", positive: true).to_s("F")
            end
          when "billing.create_service"
            resolved["name"] = text!(inputs.fetch("name"), maximum: 160)
            resolved["code"] = text!(inputs["code"], maximum: 50, required: false)
            resolved["description"] = text!(inputs["description"], maximum: 500, required: false)
            resolved["unit_amount"] = money!(inputs.fetch("unit_amount"), name: "unit amount")
            resolved["currency"] = currency!(inputs.fetch("currency"))
          when "billing.refund_cash"
            resolved["_payment"] = choice!(inputs.fetch("payment"), Clinic::PaymentEvent.where(practice:, patient:).joins(:cash_tender)
              .where(clinic_cash_tenders: { cash_drawer_session_id: practice.cash_drawer_sessions.where(site:, status: "open").select(:id) }))
            resolved["amount"] = money!(inputs.fetch("amount"), name: "refund", positive: true)
            resolved["reason"] = text!(inputs.fetch("reason"), maximum: 200)
          when "inventory.observe_count", "inventory.transfer_stock", "inventory.adjust_stock", "inventory.hold_stock"
            batch = choice!(inputs.fetch("batch"), batch_scope.includes(:product, :location_record))
            resolved["_batch"] = batch
            unless key == "inventory.hold_stock"
              resolved["quantity"] = Clinic::Inventory::Quantity.parse(inputs.fetch("quantity"), scale: batch.product.quantity_scale,
                zero: key == "inventory.observe_count").to_s("F")
            end
            resolved["reason"] = text!(inputs.fetch("reason"), maximum: 200)
            if key == "inventory.transfer_stock"
              resolved["_location"] = choice!(inputs.fetch("location"), location_scope)
              resolved["_location"].ensure_stock_destination!
            end
          when "inventory.receive_stock", "inventory.draft_purchase_order"
            resolved["_product"] = choice!(inputs.fetch("product"), practice.pharmacy_products.where(active: true))
            resolved["quantity"] = Clinic::Inventory::Quantity.parse(inputs.fetch("quantity"), scale: 0).to_s("F")
            resolved["reason"] = text!(inputs.fetch("reason"), maximum: 200)
            if key == "inventory.receive_stock"
              resolved["_location"] = choice!(inputs.fetch("location"), location_scope)
              resolved["_location"].ensure_stock_destination!
              resolved["lot_number"] = text!(inputs.fetch("lot_number"), maximum: 100)
              resolved["expires_on"] = Date.iso8601(inputs.fetch("expires_on")).iso8601
              resolved["supplier"] = text!(inputs["supplier"], maximum: 120, required: false)
              resolved["_lot"] = Clinic::Inventory::Lot.find_by(practice:, product: resolved["_product"], number: resolved["lot_number"])
            else
              resolved["_supplier"] = choice!(inputs.fetch("supplier_record"), practice.inventory_suppliers)
              resolved["unit_price"] = Clinic::Inventory::Quantity.parse(inputs.fetch("unit_price"), scale: 6, zero: true).to_s("F")
              resolved["currency"] = currency!(inputs.fetch("currency"))
            end
          when "inventory.create_location", "inventory.rename_location"
            resolved["name"] = text!(inputs.fetch("name"), maximum: 100)
            resolved["_location"] = choice!(inputs.fetch("location"), location_scope) if key == "inventory.rename_location"
          when "operations.review_callback"
            resolved["_callback"] = choice!(inputs.fetch("callback"), callback_scope.where(status: "pending"))
            resolved["note"] = text!(inputs["note"], maximum: 1_000, required: false)
          when "operations.plan_follow_up"
            resolved["plan"] = text!(inputs.fetch("plan"), maximum: 4_000)
            resolved["due_at"] = Time.iso8601(inputs["due_at"]).utc.iso8601(6) if inputs["due_at"].present?
            resolved["_follow_up"] = Clinic::EncounterFollowUp.find_by(practice:, encounter:)
            if resolved["_follow_up"] && resolved["_follow_up"].state != "needed"
              raise ArgumentError, "This follow-up already has a different state. Review its existing workflow before replacing the plan."
            end
          when "workforce.schedule_draft", "workforce.add_shift"
            resolved["_draft"] = choice!(inputs.fetch("draft"), Clinic::Workforce::ScheduleDraft.where(practice:, site:, status: "draft"))
            if key == "workforce.add_shift"
              employment = choice!(inputs.fetch("employment"), Clinic::Workforce::Employment.where(practice:).includes(:employment_sites, membership: :user))
              unless employment.active_for_work?(at: Current.business_time) && employment.eligible_site?(site, at: Current.business_time)
                raise ArgumentError, "The employee is not currently active and eligible at this location."
              end
              resolved["_employment"] = employment
              resolved["role_name"] = text!(inputs["role_name"], maximum: 120, required: false)
              resolved["break_minutes"] = Integer((inputs["break_minutes"].presence || "0").to_s, 10)
              raise ArgumentError, "Break minutes must be between 0 and 1440." unless resolved["break_minutes"].between?(0, 1_440)
              Clinic::Workforce::ResolveLocalInterval.call(timezone: resolved["_draft"].timezone,
                local_start: inputs.fetch("local_start"), local_end: inputs.fetch("local_end"),
                start_occurrence: inputs.fetch("start_occurrence"), end_occurrence: inputs.fetch("end_occurrence"))
            end
          when "workforce.create_schedule_draft"
            resolved["week_start_on"] = Date.iso8601(inputs.fetch("week_start_on"))
            raise ArgumentError, "Choose a Monday for the draft week." unless resolved["week_start_on"].monday?
            if inputs["template"].present?
              resolved["_template"] = choice!(inputs["template"], Clinic::Workforce::ScheduleTemplate.where(practice:, site:, active: true))
            end
          end
          resolved
        end

        def versions(key:, resolved:)
          values = { "site" => ContextRegistry.record_version(site) }
          values["patient"] = ContextRegistry.record_version(patient) if PATIENT_KEYS.include?(key)
          values["encounter"] = ContextRegistry.record_version(encounter) if ENCOUNTER_KEYS.include?(key)
          resolved.each do |name, record|
            values[name] = { "id" => record.id.to_s, "version" => ContextRegistry.record_version(record) } if record.is_a?(ApplicationRecord)
          end
          if key == "operations.plan_follow_up"
            values["follow_up"] = resolved["_follow_up"] ? ContextRegistry.record_version(resolved["_follow_up"]) : "absent"
          elsif key.start_with?("inventory.") && CHANGES.key?(key)
            values["inventory_profile"] = practice.inventory_profiles.maximum(:version)
          end
          if resolved["_batch"]
            batch = resolved.fetch("_batch")
            values["stock_cutoff"] = batch.movements.maximum(:id)&.to_s
            values["product"] = ContextRegistry.record_version(batch.product)
            values["active_holds"] = batch.active_holds.order(:id).pluck(:id).map(&:to_s)
            values["location"] = ContextRegistry.record_version(batch.location_record)
          end
          if resolved["_invoice"]
            invoice = resolved.fetch("_invoice")
            values["invoice_lines"] = invoice.lines.order(:id).pluck(:id).map(&:to_s)
            values["invoice_allocations"] = invoice.payment_allocations.order(:id).pluck(:id).map(&:to_s)
            values["invoice_credits"] = invoice.credit_notes.order(:id).pluck(:id).map(&:to_s)
            values["collection_intents"] = invoice.payment_collection_intents.order(:id).pluck(:id, :state, :updated_at).map do |id, state, at|
              [ id.to_s, state, at&.utc&.iso8601(6) ]
            end
          end
          if resolved["_payment"]
            payment = resolved.fetch("_payment")
            values["refunds"] = payment.refund_events.order(:id).pluck(:id).map(&:to_s)
            values["payment_drawer"] = ContextRegistry.record_version(payment.cash_tender.cash_drawer_session)
          end
          if resolved["_drawer"]
            values["drawer_tenders"] = resolved["_drawer"].cash_tenders.order(:id).pluck(:id).map(&:to_s)
          end
          if resolved["_location"]
            values["location_children"] = resolved["_location"].children.order(:id).pluck(:id).map(&:to_s)
          end
          if key == "inventory.receive_stock"
            values["receiving_lot"] = resolved["_lot"] ? ContextRegistry.record_version(resolved["_lot"]) : "absent"
            values["recalls"] = Clinic::Inventory::Recall.where(practice:, product: resolved.fetch("_product")).order(:id).pluck(:id, :updated_at)
              .map { |id, at| [ id.to_s, at&.utc&.iso8601(6) ] }
          end
          values
        end

        def execute(key:, resolved:)
          authorize!(key:, inputs: resolved)
          payload = if INVENTORY_METHODS.key?(key)
            filters = { query: resolved["query"] }
            filters[:page] = resolved["page"] unless key == "inventory.activity"
            Clinic::Inventory::InventoryWire.public_send(INVENTORY_METHODS.fetch(key), practice:, actor:, **filters)
          elsif REPORT_QUERIES.key?(key)
            arguments = { practice:, actor: }
            arguments.merge!(date: resolved.fetch("_date"), page: resolved["page"]) if %w[reports.daily_invoices reports.daily_stock].include?(key)
            REPORT_QUERIES.fetch(key).call(**arguments)
          else
            execute_domain(key, resolved)
          end
          title = (READS[key] || CHANGES.fetch(key)).first
          { title:, sections: present_payload(payload), source_path: source_path(key) }
        end

        private

        attr_reader :practice, :actor, :site, :patient, :encounter

        def execute_domain(key, input)
          page, query = input.values_at("page", "query")
          case key
          when "billing.dashboard"
            Clinic::Billing::Dashboard.call(practice:, query:, page:, patient_identity_access: identity_access?)
          when "billing.patient_ledger"
            Clinic::Billing::PatientLedger.call(practice:, patient:, include_adjustment_evidence: true, history_limit: 20)
          when "billing.invoices"
            paged(practice.invoices.where(patient_id: patient.id).includes(:lines, :payment_allocations, :credit_notes,
              :payment_collection_intents, :subscription_agreement, invoice_stripe_checkouts: :collection_intent).order(created_at: :desc, id: :desc), page) do |invoice|
              Clinic::Billing::InvoiceSerializer.call(invoice)
            end
          when "billing.invoice"
            { invoice: Clinic::Billing::InvoiceSerializer.call(input.fetch("_invoice"), detail: true) }
          when "billing.services"
            scope = practice.billing_services.order(:name, :id)
            scope = scope.where("name ILIKE ? OR code ILIKE ?", pattern(query), pattern(query)) if query.present?
            paged(scope, page) { |record| Clinic::BillingServiceSerializer.call(record) }
          when "billing.cash_drawers"
            paged(practice.cash_drawer_sessions.where(site:).order(created_at: :desc, id: :desc), page) { |record| Clinic::Billing::CashDrawer.call(record) }
          when "billing.estimates"
            paged(Clinic::Billing::CashPayEstimate.where(practice:, patient:).includes(:lines).order(created_at: :desc, id: :desc), page) { |record| estimate_payload(record) }
          when "billing.create_service"
            attributes = input.slice("name", "code", "description", "unit_amount", "currency").symbolize_keys
            result = Clinic::Billing::ManageBillingService.create(practice:, actor:, request_key: request_key(input), attributes:)
            { service: Clinic::BillingServiceSerializer.call(result.service) }
          when "billing.update_service"
            service = input.fetch("_service")
            result = Clinic::Billing::ManageBillingService.update(practice:, actor:, service:, request_key: request_key(input),
              lock_version: service.lock_version, attributes: { unit_amount: input.fetch("unit_amount") })
            { service: Clinic::BillingServiceSerializer.call(result.service) }
          when "billing.draft_estimate"
            service = input.fetch("_service")
            estimate = Clinic::Billing::CreateCashPayEstimate.call(practice:, actor:, patient:, currency: service.currency,
              classification: "general_estimate", lines: [ { billing_service_id: service.id, quantity: input.fetch("quantity") } ],
              request_key: request_key(input))
            { estimate: estimate_payload(estimate) }
          when "billing.record_cash"
            invoice = input.fetch("_invoice")
            allocation = Clinic::Billing::RecordCashPayment.call(practice:, actor:, patient:, invoice:,
              drawer_session: input.fetch("_drawer"), tendered_amount: input.fetch("tendered_amount"),
              allocation_amount: input.fetch("allocation_amount"), request_key: request_key(input))
            { payment: { allocated: allocation.amount.to_s("F"), currency: invoice.currency,
              change: allocation.payment_event.cash_tender.change_amount.to_s("F") },
              invoice: Clinic::Billing::InvoiceSerializer.call(invoice.reload, detail: true),
              drawer: Clinic::Billing::CashDrawer.call(input.fetch("_drawer").reload) }
          when "billing.refund_cash"
            payment = input.fetch("_payment")
            refund = local_change(key, input, resource: payment, action: "billing.payment_record") do
              Clinic::Billing::RecordCashRefund.call(practice:, actor:, payment:, amount: input.fetch("amount"), reason: input.fetch("reason")).first
            end
            { refund: { amount: refund.amount.to_s("F"), currency: refund.currency, reason: refund.reason },
              drawer: Clinic::Billing::CashDrawer.call(payment.cash_tender.cash_drawer_session.reload) }
          when "billing.credit_invoice", "billing.write_off_invoice"
            method = key == "billing.credit_invoice" ? :credit : :write_off
            result = Clinic::Billing::InvoiceAdjustments.public_send(method, invoice: input.fetch("_invoice"), actor:,
              amount: input.fetch("amount"), reason: input.fetch("reason"), request_key: request_key(input))
            { invoice: Clinic::Billing::InvoiceSerializer.call(result.invoice, detail: true),
              adjustment: { amount: result.credit.amount.to_s("F"), currency: result.credit.currency, reason: result.credit.reason } }
          when "billing.draft_invoice"
            service = input.fetch("_service")
            invoice = Clinic::Billing::DraftInvoice.call(practice:, actor:, patient:, currency: service.currency,
              lines: [ { billing_service_id: service.id, service_lock_version: service.lock_version, quantity: input.fetch("quantity") } ],
              request_key: request_key(input))
            { invoice: Clinic::Billing::InvoiceSerializer.call(invoice, detail: true), outcome: "Draft saved; posting and payment collection await human review." }
          when "inventory.observe_count"
            count = Clinic::Inventory::Count.observe!(batch: input.fetch("_batch"), actor:, observed: input.fetch("quantity"),
              reason: input.fetch("reason"), request_key: inventory_request_key(input))
            { outcome: "Observation recorded; stock has not been corrected.", observed_quantity: count.observed_quantity.to_s("F"),
              expected_quantity: count.expected_quantity.to_s("F"), reason: count.reason, approval: "Requires a different counter's review." }
          when "inventory.receive_stock"
            product, location = input.values_at("_product", "_location")
            receipt = Clinic::Inventory::Receiving.call(practice:, actor:, request_key: inventory_request_key(input),
              reason: input.fetch("reason"), supplier: input["supplier"], lines: [ { product_id: product.id,
                lot_number: input.fetch("lot_number"), expires_on: input.fetch("expires_on"), location_id: location.id,
                amount: input.fetch("quantity"), input_unit: "package" } ])
            { receipt: { supplier: receipt.supplier&.name, reason: receipt.reason, received_at: receipt.received_at.iso8601(6),
              lines: receipt.lines.includes(batch: :product).map do |line|
                { product: line.batch.product.name, lot: line.batch.lot_number, received_packages: line.input_quantity.to_s("F"),
                  stock_units: line.quantity.to_s("F"), stock_unit: line.stock_unit, cost: "Not recorded" }
              end } }
          when "inventory.transfer_stock"
            transfer = Clinic::Inventory::TransferStock.call(practice:, actor:, source_batch_id: input.fetch("_batch").id,
              destination_location_id: input.fetch("_location").id, amount: input.fetch("quantity"),
              reason: input.fetch("reason"), request_key: inventory_request_key(input))
            { transfer: { product: transfer.source_batch.product.name, source: transfer.source_batch.location_record.name,
              destination: transfer.destination_batch.location_record.name, quantity: transfer.quantity.to_s("F"),
              source_balance: transfer.source_batch.reload.quantity.to_s("F"), destination_balance: transfer.destination_batch.reload.quantity.to_s("F") } }
          when "inventory.adjust_stock"
            batch = input.fetch("_batch")
            movement = batch.move!(kind: input.fetch("kind"), amount: input.fetch("quantity"), actor:,
              reason: input.fetch("reason"), request_key: inventory_request_key(input))
            { movement: { kind: movement.kind, quantity: movement.quantity.to_s("F"), reason: movement.reason,
              balance: batch.reload.quantity.to_s("F"), unit: batch.product.stock_unit } }
          when "inventory.hold_stock"
            batch = input.fetch("_batch")
            batch.change_status!(status: input.fetch("kind"), actor:, reason: input.fetch("reason"), request_key: inventory_request_key(input))
            { hold: { product: batch.product.name, lot: batch.lot_number, status: batch.reload.status, reason: input.fetch("reason") } }
          when "inventory.draft_purchase_order"
            order = Clinic::Inventory::DraftPurchaseOrder.call(practice:, actor:, attributes: {
              receiving_site_id: site.id, supplier_id: input.fetch("_supplier").id, reason: input.fetch("reason"),
              request_key: inventory_request_key(input), lines: [ { product_id: input.fetch("_product").id,
                quantity: input.fetch("quantity"), input_unit: "package", unit_price: input.fetch("unit_price"), currency: input.fetch("currency") } ] })
            Clinic::Inventory::InventoryWire.purchase_order(order).merge(outcome: "Local draft saved; submission, approval and supplier sending remain human actions.")
          when "inventory.create_location", "inventory.rename_location"
            attributes = key == "inventory.create_location" ? { name: input.fetch("name"), kind: input.fetch("kind"), site_id: site.id, status: "active" } : { name: input.fetch("name") }
            location = local_change(key, input, resource: input["_location"] || site, action: "inventory.configure") do
              Clinic::Inventory::ManageLocation.call(practice:, actor:, attributes:, location_id: input["_location"]&.id)
            end
            { location: { name: location.name, kind: location.kind, status: location.status, site: site.name } }
          when "workforce.schedules" then staff_schedules(page)
          when "workforce.create_schedule_draft"
            template = input["_template"]
            draft = local_change(key, input, resource: site, action: "workforce.schedule.manage") do
              Clinic::Workforce::CreateScheduleDraft.call(practice:, actor:, site:, week_start_on: input.fetch("week_start_on"),
                timezone: template&.timezone || site.timezone_override.presence || practice.timezone, template:)
            end
            { draft: Clinic::Workforce::ScheduleSerializer.draft(draft) }
          when "workforce.add_shift"
            shift = local_change(key, input, resource: input.fetch("_draft"), action: "workforce.schedule.manage") do
              attributes = input.slice("local_start", "local_end", "start_occurrence", "end_occurrence", "role_name", "break_minutes")
                .merge("employment_id" => input.fetch("_employment").id, "expected_revision" => input.fetch("_draft").revision)
              Clinic::Workforce::UpsertScheduleShift.call(draft: input.fetch("_draft"), actor:, attributes:).last
            end
            { draft: Clinic::Workforce::ScheduleSerializer.draft(input.fetch("_draft").reload),
              shift: Clinic::Workforce::ScheduleSerializer.shift(shift) }
          when "workforce.schedule_draft"
            draft = input.fetch("_draft")
            validation = Clinic::Workforce::ValidateSchedule.call(draft:)
            { draft: Clinic::Workforce::ScheduleSerializer.draft(draft), valid: validation.valid?, errors: validation.errors, warnings: validation.warnings }
          when "workforce.requests" then workforce_requests(page)
          when "workforce.timecards" then timecards(page)
          when "workforce.employments"
            scope = Clinic::Workforce::Employment.where(practice:).includes(:staff_member,
              { membership: [ :user, { role_grants: :role_version } ] }, employment_sites: :site).order(:id)
            paged(scope, page) { |record| Clinic::Workforce::EmploymentSerializer.call(record) }
          when "workforce.settings" then Clinic::Workforce::EffectiveSettings.call(practice:, site:)
          when "facilities.site" then { site: Clinic::FacilitySerializer.site(site, detail: true) }
          when "facilities.rooms", "facilities.departments", "facilities.visit_types" then facilities(key, query, page)
          when "operations.follow_ups"
            Clinic::Operations::FollowUpWorklist.call(practice:, actor:, site_id: site.id, page:,
              staff_requests_page: page, encounter_follow_ups_page: page, renewal_exceptions_page: page)
          when "operations.recalls"
            Clinic::Operations::RecallWorklist.call(practice:, actor:, site_id: site.id)
          when "operations.callbacks"
            paged(callback_scope.where(status: %w[pending in_review]).order(:requested_at, :id), page) { |record| callback_payload(record) }
          when "operations.review_callback"
            record = Clinic::PatientPortal::ReviewRequest.call(practice:, actor:, request: input.fetch("_callback"),
              status: "in_review", review_note: input["note"], request_key: request_key(input))
            { callback: callback_payload(record), outcome: "In review; no patient contact has been recorded." }
          when "operations.configuration" then Clinic::Operations::ConfigurationManifest.call(practice:, actor:)
          when "operations.encounter_follow_up" then Clinic::Operations::EncounterFollowUps.show(practice:, actor:, encounter:)
          when "operations.plan_follow_up"
            record = Clinic::Operations::EncounterFollowUps.record(practice:, actor:, encounter:,
              request_key: request_key(input), expected_version: input["_follow_up"]&.lock_version || 0,
              attributes: { status: "needed", plan: input.fetch("plan"), due_at: input["due_at"],
                assigned_to_membership_id: input["_follow_up"]&.assigned_to_membership_id })
            { follow_up: Clinic::Operations::EncounterFollowUps.serialize(record) }
          when "schedule.calendar"
            Clinic::Scheduling::Calendar.new(practice:, site:, actor:, date: input.fetch("_date"), period: "day").call
          when "schedule.waitlist"
            scope = Clinic::Scheduling::WaitlistEntry.where(practice:, site:, patient:, state: %w[waiting offered])
              .includes(:patient, :site, :clinician, :visit_type).order(:created_at, :id)
            paged(scope, 1) { |record| Clinic::Scheduling::Waitlist.serialize(record) }
          when "reports.daily_visits" then Clinic::Reports::DailyVisitsByState.call(practice:, actor:, site:, date: input.fetch("_date"), page:)
          when "reports.daily_payments"
            Clinic::Reports::DailyPaymentActivity.call(practice:, actor:, date: input.fetch("_date"), payment_page: page, refund_page: page)
          when "reports.daily_drawers"
            Clinic::Reports::DailyCashDrawers.call(practice:, actor:, date: input.fetch("_date"), page:, carried_page: page)
          when "reports.current_stock" then Clinic::Reports::CurrentStock.call(practice:, actor:, page:, office_page: page)
          when "reports.open_work" then Clinic::Reports::OpenClinicalWork.call(practice:, actor:, site:)
          when "reports.scribe" then Clinic::Reports::ScribeActivity.call(practice:, actor:, page:)
          when "reports.day_end_preview" then Clinic::Reports::DayEndReconciliation.call(practice:, actor:, site:, date: input.fetch("_date"))
          else raise ArgumentError, "This workflow is unavailable."
          end
        end

        def staff_schedules(page)
          templates = Clinic::Workforce::ScheduleTemplate.where(practice:, site:, active: true).order(:name, :id)
          drafts = Clinic::Workforce::ScheduleDraft.where(practice:, site:, status: "draft").order(week_start_on: :desc, id: :desc)
          publications = Clinic::Workforce::SchedulePublication.where(practice:, site:)
          publications = publications.where(id: publications.group(:week_start_on).maximum(:id).values).includes(:site).order(week_start_on: :desc)
          { templates: paged(templates, page) { |record| Clinic::Workforce::ScheduleSerializer.template(record) },
            drafts: paged(drafts, page) { |record| Clinic::Workforce::ScheduleSerializer.draft(record, include_shifts: false) },
            publications: paged(publications, page) { |record| Clinic::Workforce::ScheduleSerializer.publication(record) } }
        end

        def workforce_requests(page)
          classes = [ Clinic::Workforce::AvailabilityVersion, Clinic::Workforce::TimeOffRequest, Clinic::Workforce::ShiftSwapRequest ]
          classes.to_h do |klass|
            scope = klass.where(practice:, site:, status: %w[submitted accepted]).order(created_at: :desc, id: :desc)
            scope = scope.includes(target_employment: :staff_member) if klass == Clinic::Workforce::ShiftSwapRequest
            [ klass.name.demodulize.underscore, paged(scope, page) { |record| Clinic::Workforce::RequestSerializer.call(record) } ]
          end
        end

        def timecards(page)
          scope = Clinic::Workforce::TimecardVersion.where(practice:)
          scoped_site_id = nil
          unless workforce.allow?("workforce.timecards.read")
            scoped_site_id = site.id
            scope = scope.joins(:time_segments).where(clinic_workforce_time_segments: { site_id: site.id }).distinct
          end
          paged(scope.includes(employment: :staff_member).order(period_start: :desc, version_number: :desc), page) do |record|
            Clinic::Workforce::TimecardSerializer.call(record, site_id: scoped_site_id)
          end
        end

        def facilities(key, query, page)
          scope, serializer = case key
          when "facilities.rooms" then [ practice.rooms.where(site:), :room ]
          when "facilities.departments" then [ practice.departments, :department ]
          when "facilities.visit_types"
            ids = Clinic::Configuration::StarterProfile.available_visit_type_ids(practice:, site:)
            [ practice.visit_types.active.where(id: ids), :visit_type ]
          end
          scope = scope.where("code ILIKE ?", pattern(query)) if query.present?
          paged(scope.order(:code, :id), page) { |record| Clinic::FacilitySerializer.public_send(serializer, record) }
        end

        def batch_scope
          Clinic::Inventory::PharmacyBatch.where(practice:).joins(:location_record)
            .where(clinic_inventory_locations: { site_id: site.id })
        end

        def location_scope
          Clinic::Inventory::Location.where(practice:, site:, status: "active").includes(:site, :children, :parent_location)
        end

        def estimate_payload(estimate)
          { status: estimate.status, classification: estimate.classification, currency: estimate.currency,
            total: estimate.lines.sum(&:expected_amount).to_s("F"), revision: estimate.revision,
            lines: estimate.lines.map { |line| { description: line.description_snapshot, quantity: line.quantity.to_s("F"),
              unit_amount: line.unit_amount.to_s("F"), expected_amount: line.expected_amount.to_s("F") } } }
        end

        def local_change(key, input, resource:, action:)
          outcome = Clinic::Idempotency.execute(practice:, actor:, operation_code: "assistant.#{key}",
            request_key: request_key(input), payload: input.reject { |name, _| name.start_with?("_") }.transform_values { |value| value.is_a?(Date) ? value.iso8601 : value },
            resource:, authorization_action: action, authorization: -> { authorize!(key:, inputs: input) },
            result_resource: ->(record) { record },
            resource_resolver: ->(practice:, receipt:) { local_resource(key, receipt.resource_id) }) do
            yield
          end
          outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
        end

        def local_resource(key, id)
          case key
          when "billing.refund_cash" then Clinic::RefundEvent.where(practice:).find_by(id:)
          when "inventory.create_location", "inventory.rename_location" then Clinic::Inventory::Location.where(practice:).find_by(id:)
          when "workforce.create_schedule_draft" then Clinic::Workforce::ScheduleDraft.where(practice:, site:).find_by(id:)
          when "workforce.add_shift" then Clinic::Workforce::Shift.where(practice:).joins(:schedule_draft)
            .where(clinic_workforce_schedule_drafts: { site_id: site.id }).find_by(id:)
          end
        end

        def callback_scope
          practice.patient_portal_requests.callback.where(patient_id: patient.id)
        end

        def callback_payload(record)
          { status: record.status, content: record.content, requested_at: record.requested_at.iso8601(6),
            reviewed_at: record.reviewed_at&.iso8601(6), review_note: record.review_note }
        end

        def choice!(reference, scope)
          raise ArgumentError, "Choose an available record." unless reference.is_a?(Hash) && reference["record_type"] == scope.klass.name

          record = scope.find(reference.fetch("record_id"))
          unless reference.fetch("version") == ContextRegistry.record_version(record)
            raise ActiveRecord::StaleObjectError.new(record, "select")
          end
          record
        end

        def validate_context!
          raise ActiveRecord::RecordNotFound unless site && site.practice_id == practice.id
          raise ActiveRecord::RecordNotFound if patient && (patient.practice_id != practice.id || patient.merged_into_patient_id.present?)
          if encounter && (encounter.practice_id != practice.id || encounter.site_id != site.id || encounter.patient_id != patient&.id)
            raise ActiveRecord::RecordNotFound
          end
        end

        def require_patient!
          raise ArgumentError, "Select a patient for this workflow." unless patient
        end

        def require_encounter!
          require_patient!
          raise ArgumentError, "Select an encounter for this workflow." unless encounter
        end

        def schedule_enabled!
          values = Clinic::Workforce::EffectiveSettings.call(practice:, site:).fetch(:values)
          raise Clinic::Assistant::WorkflowRegistry::Gated, "Scheduling is not enabled for this location." unless values.fetch("schedule_enabled") == true
        rescue Clinic::Workforce::EffectiveSettings::Unconfigured
          raise Clinic::Assistant::WorkflowRegistry::Gated, "Workforce settings are not configured for this location."
        end

        def authorize(action, legacy: nil, selected_site: false, any_site: false)
          arguments = { actor:, practice:, action:, any_site: }
          arguments[:site] = site if selected_site
          if legacy
            Clinic::Authorization.authorize_with_legacy!(**arguments, legacy_action: legacy)
          else
            Clinic::Authorization.authorize!(**arguments)
          end
        end

        def identity_access?
          ability.allowed_permission?("patients.read", any_site: true) || ability.allowed_permission?("patients.identity.read", any_site: true)
        end

        def ability = Ability.new(actor, practice:)
        def workforce = Clinic::Workforce::Access.new(actor:, practice:)
        def pattern(value) = "%#{ActiveRecord::Base.sanitize_sql_like(value)}%"
        def request_key(input) = input["_request_key"].presence || SecureRandom.uuid
        def inventory_request_key(input) = request_key(input).delete_prefix("assistant-")
        def money!(value, name:, positive: false) = Clinic::Billing::Money.currency_amount(value, name:, positive:).to_s("F")

        def currency!(value)
          currency = value.to_s.strip
          raise ArgumentError, "Currency must be a three-letter uppercase code." unless currency.match?(/\A[A-Z]{3}\z/)
          currency
        end

        def known!(key)
          raise ArgumentError, "This workflow is unavailable." unless READS.key?(key) || CHANGES.key?(key)
        end

        def text!(value, maximum:, required: true)
          text = value.to_s.strip
          raise ArgumentError, "Enter the required text." if required && text.blank?
          raise ArgumentError, "Text must be #{maximum} characters or fewer." if text.length > maximum
          text.presence
        end

        def paged(scope, page)
          total = scope.count
          { total:, page:, page_size: 25, records: scope.limit(25).offset((page - 1) * 25).map { |record| yield(record) } }
        end

        # Result cards use recorded domain values. Identifiers and opaque references
        # remain server-side; choices are issued separately by the context registry.
        def present_payload(payload, title = nil, depth = 0)
          return [] if depth > 5

          if payload.is_a?(Hash)
            fields = payload.filter_map do |name, value|
              next if hidden_field?(name, value, title) || value.is_a?(Hash) || value.is_a?(Array)

              { label: presentation_name(name, value).humanize, value: display_value(value) }
            end
            sections = fields.any? ? [ { title:, fields: } ] : []
            payload.each do |name, value|
              next if hidden_field?(name, value, title)

              sections.concat(present_payload(value, name.to_s.humanize, depth + 1)) if value.is_a?(Hash) || value.is_a?(Array)
            end
            sections
          elsif payload.is_a?(Array)
            rows = payload.first(50).map { |row| row.is_a?(Hash) ? flatten_row(row) : { "value" => display_value(row) } }
            keys = rows.flat_map(&:keys).uniq
            return [ { title:, fields: [ { label: "Records", value: "No records in this source page." } ] } ] if keys.empty?

            [ { title:, fields: [ { label: "Shown in this source page", value: rows.length },
              { label: "Additional rows in this source page", value: [ payload.length - rows.length, 0 ].max } ],
              columns: keys.map { |name| { key: name, label: name.humanize } }, rows: } ]
          else
            [ { title:, fields: [ { label: "Value", value: display_value(payload) } ] } ]
          end
        end

        def flatten_row(row, prefix = "")
          row.to_h.each_with_object({}) do |(name, value), result|
            next if hidden_field?(name, value, prefix)

            label = [ prefix.presence, presentation_name(name, value) ].compact.join("_")
            if value.is_a?(Hash)
              result.merge!(flatten_row(value, label))
            elsif value.is_a?(Array)
              result[label] = value.map { |item| item.is_a?(Hash) ? flatten_row(item).values.compact.join(" · ") : display_value(item) }.join("; ")
            else
              result[label] = display_value(value)
            end
          end
        end

        def presentation_name(name, value)
          name.to_s == "available" && [ true, false ].include?(value) ? "available_for_use" : name.to_s
        end

        def hidden_field?(name, value = nil, parent = nil)
          text = name.to_s
          text == "id" || text.end_with?("_id", "_ids", "_digest", "_token", "_reference", "_ref") ||
            %w[href url source_digest source_revision definition_revision shift_snapshot lock_version schema_version can_write capabilities current_user_id users].include?(text) ||
            (text == "revision" && parent.to_s.downcase == "definition") ||
            (text == "source" && value.is_a?(String) && value.match?(/\bclinic_[a-z_]+\b/))
        end

        def display_value(value)
          return value.to_s("F") if value.is_a?(BigDecimal)
          return value.iso8601 if value.is_a?(Date) || value.is_a?(Time) || value.is_a?(ActiveSupport::TimeWithZone)

          value.nil? ? "Not recorded" : value
        end

        def source_path(key)
          case key.split(".").first
          when "billing" then "/clinic/billing"
          when "inventory" then "/clinic/inventory"
          when "workforce" then "/clinic/workforce"
          when "facilities" then "/clinic/facilities"
          when "operations" then "/clinic/operations"
          when "schedule" then "/clinic/schedule"
          when "reports" then "/clinic/reports"
          end
        end
      end
    end
  end
end
