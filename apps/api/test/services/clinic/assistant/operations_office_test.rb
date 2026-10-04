require "test_helper"

class Clinic::Assistant::OperationsOfficeTest < ActiveSupport::TestCase
  setup do
    travel_to Time.utc(2026, 10, 4, 12)
    @practice = Clinic::Practice.create!(name: "Synthetic assistant operations clinic", timezone: "UTC")
    @actor = User.create!(email_address: "assistant-office-#{SecureRandom.hex(6)}@example.invalid", password: SecureRandom.hex(20))
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, *(Permission.pluck(:action_code) | %w[
      billing.read billing.catalog.manage billing.invoice_draft billing.invoice_post billing.payment_record billing.cash_reconcile
      inventory.read inventory.configure inventory.receive inventory.transfer inventory.adjust inventory.count procurement.read procurement.create
      recall.read controlled.read patients.read patients.identity.read encounters.write clinical_records.read appointments.read appointments.write
      facilities.read facilities.write roles.manage reminders.read subscriptions.review subscription_catalog.read subscription_catalog.write
      staff_messaging.read staff_messaging.send staff_messaging.create_conversation staff_messaging.transition
      workforce.admin workforce.schedule.read workforce.schedule.manage workforce.requests.review workforce.timecards.read scribe.read
    ]), effective_from: Time.utc(2026, 1, 1))
    @site = @practice.sites.create!(code: "OFFICE", name: "Synthetic office", status: "active",
      address_line1: "100 Synthetic Way", city: "Synthetic City", state: "CA", postal_code: "90000", country: "US")
    configure_site!(@site, membership: @membership)
    @patient = @practice.patients.create!(display_name: "Synthetic operations patient", reference: "OPERATIONS-001")
    @encounter = @practice.encounters.create!(patient: @patient, site: @site, started_at: 1.hour.ago, status: "in_progress")
    @operations = Clinic::Assistant::Workflows::Operations.new(practice: @practice, actor: @actor, site: @site, patient: @patient, encounter: @encounter)
    @office = Clinic::Assistant::Workflows::Office.new(practice: @practice, actor: @actor, site: @site, patient: @patient, encounter: @encounter)
    Clinic::Inventory::Profile.revise!(practice: @practice, actor: @actor, status: "synthetic", reason: "Synthetic assistant verification")
    Clinic::Workforce::SettingsVersion.create!(practice: @practice, scope_kind: "practice", revision: 1,
      effective_from: 1.day.ago, created_by_membership: @membership, values: workforce_settings)
  end

  teardown { travel_back }

  test "every non-record-required read returns a bounded presentable source result" do
    failures = []
    [ @operations, @office ].each do |handler|
      handler.class.definitions.select { |definition| definition[:kind] == "read" }.each do |definition|
        next if definition[:fields].any? { |field| field[:type] == "record" && field[:required] }

        key = definition.fetch(:key)
        begin
          inputs = definition[:fields].any? { |field| field[:key] == "date" } ? { "date" => "2026-10-04" } : {}
          resolved = handler.resolve(key:, inputs:)
          handler.authorize!(key:, inputs: resolved)
          result = Clinic::Assistant::WorkflowPresenter.present!(handler.execute(key:, resolved:))
          raise "Missing source title" if result[:title].blank?
          raise "Missing source sections" if result[:sections].empty?
          raise "Missing source route" unless result[:source_path].start_with?("/clinic/")
          raise "Unbounded sections" if result[:sections].length > Clinic::Assistant::WorkflowPresenter::MAX_SECTIONS
        rescue StandardError => error
          failures << "#{key}: #{error.class}: #{error.message}"
        end
      end
    end
    assert_empty failures, failures.join("\n")
  end

  test "invoice draft and exact cash receipt persist authoritative terms and replay once" do
    service = @practice.billing_services.create!(name: "Synthetic visit", unit_amount: "12.35", currency: "USD")
    resolved, result = execute(@operations, "billing.draft_invoice", { "service" => reference(service), "quantity" => "2" })
    invoice = @practice.invoices.sole
    assert_equal "draft", invoice.status
    assert_equal @patient.id, invoice.patient_id
    assert_equal BigDecimal("24.70"), invoice.lines.sole.posted_amount
    assert_includes result.to_json, "Synthetic visit"
    @operations.execute(key: "billing.draft_invoice", resolved:)
    assert_equal invoice.id, @practice.invoices.sole.id

    Clinic::Billing::PostInvoice.call(invoice:, actor: @actor, request_key: SecureRandom.uuid)
    execute(@office, "office.cash_drawer_open", { "currency" => "USD", "opening_float" => "10.00" })
    drawer = @practice.cash_drawer_sessions.sole
    cash_input, cash_result = execute(@operations, "billing.record_cash", {
      "invoice" => reference(invoice.reload), "drawer" => reference(drawer), "tendered_amount" => "30.00", "allocation_amount" => "24.70"
    })
    allocation = invoice.payment_allocations.sole
    assert_equal BigDecimal("24.70"), allocation.amount
    assert_equal BigDecimal("5.30"), allocation.payment_event.cash_tender.change_amount
    assert_equal "cash_payment", allocation.payment_event.billing_receipts.sole.kind
    assert_includes cash_result.to_json, "24.7"
    @operations.execute(key: "billing.record_cash", resolved: cash_input)
    assert_equal allocation.id, invoice.payment_allocations.sole.id

    execute(@office, "office.cash_drawer_close", { "drawer" => reference(drawer.reload), "counted_cash" => "34.70", "discrepancy_explanation" => "Human-entered synthetic count" })
    assert_equal "closed", drawer.reload.status
    assert_equal BigDecimal("34.70"), drawer.counted_cash
    assert_equal BigDecimal("0"), drawer.discrepancy
    assert_equal "pending", drawer.reconciliation_status
    assert_nil drawer.reconciled_by_id
  end

  test "received packages transfer exact stock and purchase orders remain local drafts" do
    product = @practice.pharmacy_products.create!(name: "Synthetic liquid", sku: "ASSIST-LIQUID", stock_unit: "mL",
      quantity_scale: 3, package_size: "10.5", unit_reference: "Synthetic catalog package")
    shelf = @practice.inventory_locations.create!(name: "Assistant shelf", site: @site, kind: "storage")
    target = @practice.inventory_locations.create!(name: "Assistant second shelf", site: @site, kind: "storage")
    received, receipt_result = execute(@operations, "inventory.receive_stock", {
      "product" => reference(product), "location" => reference(shelf), "lot_number" => "ASSIST-LOT",
      "expires_on" => "2027-10-04", "quantity" => "2", "reason" => "Synthetic delivery"
    })
    receipt = Clinic::Inventory::Receipt.where(practice: @practice).sole
    batch = receipt.lines.sole.batch
    assert_equal BigDecimal("21"), batch.reload.quantity
    assert_equal BigDecimal("10.5"), receipt.lines.sole.conversion_factor
    assert_includes receipt_result.to_json, "Synthetic liquid"
    _, stock_report = execute(@operations, "reports.current_stock", {})
    assert_not_includes stock_report.to_json, "clinic_pharmacy_batches"
    report_columns = stock_report[:sections].flat_map { |section| Array(section[:columns]) }
    assert_includes report_columns.map { |column| column[:label] }, "Available for use"
    assert_includes report_columns.map { |column| column[:label] }, "Available"
    assert_includes stock_report.to_json, '"available":"21.0"'
    @operations.execute(key: "inventory.receive_stock", resolved: received)
    assert_equal receipt.id, Clinic::Inventory::Receipt.where(practice: @practice).sole.id

    execute(@operations, "inventory.transfer_stock", { "batch" => reference(batch), "location" => reference(target), "quantity" => "0.125", "reason" => "Synthetic bin transfer" })
    assert_equal BigDecimal("20.875"), batch.reload.quantity
    assert_equal BigDecimal("0.125"), product.batches.where(location_record: target).sole.quantity
    assert_equal BigDecimal("21"), product.batches.sum(&:quantity)

    supplier = @practice.inventory_suppliers.create!(name: "Synthetic supplier")
    draft_input, = execute(@operations, "inventory.draft_purchase_order", {
      "product" => reference(product.reload), "supplier_record" => reference(supplier), "quantity" => "3", "unit_price" => "1.25",
      "currency" => "USD", "reason" => "Local draft verification"
    })
    order = @practice.inventory_purchase_orders.sole
    assert_equal "draft", order.status
    assert_equal @site.id, order.receiving_site_id
    assert_equal BigDecimal("3.75"), order.total
    assert_equal BigDecimal("10.5"), order.lines.sole.conversion_factor
    @operations.execute(key: "inventory.draft_purchase_order", resolved: draft_input)
    assert_equal order.id, @practice.inventory_purchase_orders.sole.id
  end

  test "staff schedule draft and shift persist without publication and enforce the selected week" do
    employment = employed_member(@membership, "Synthetic coordinator")
    draft_input, = execute(@operations, "workforce.create_schedule_draft", { "week_start_on" => "2026-10-05" })
    draft = Clinic::Workforce::ScheduleDraft.where(practice: @practice).sole
    assert_equal "draft", draft.status
    assert_equal @site.id, draft.site_id
    @operations.execute(key: "workforce.create_schedule_draft", resolved: draft_input)
    assert_equal draft.id, Clinic::Workforce::ScheduleDraft.where(practice: @practice).sole.id
    attributes = { "draft" => reference(draft), "employment" => reference(employment), "local_start" => "2026-10-05T09:00",
      "local_end" => "2026-10-05T17:00", "start_occurrence" => "only", "end_occurrence" => "only", "role_name" => "Coordinator", "break_minutes" => "30" }
    execute(@operations, "workforce.add_shift", attributes)
    shift = draft.shifts.sole
    assert_equal employment.id, shift.employment_id
    assert_equal Time.utc(2026, 10, 5, 9), shift.starts_at
    assert_equal 30, shift.break_minutes
    assert_equal 2, draft.reload.revision
    assert_empty Clinic::Workforce::SchedulePublication.where(practice: @practice)
    error = assert_raises(Clinic::Workforce::ResolveLocalInterval::InvalidLocalTime) do
      execute(@operations, "workforce.add_shift", attributes.merge("draft" => reference(draft), "local_start" => "2026-10-12T09:00", "local_end" => "2026-10-12T17:00"))
    end
    assert_includes error.message, "selected week"
    assert_equal shift.id, draft.shifts.sole.id
  end

  test "office configuration revision and billing metadata persist through existing policies" do
    policy_input, result = execute(@office, "office.reminder_policy_save", { "enabled" => false, "lead_hours" => "48" })
    policy = Clinic::Reminders::PolicyVersion.current(practice: @practice)
    assert_equal false, policy.enabled
    assert_equal 48, policy.lead_hours
    assert_includes result.to_json, "48"
    @office.execute(key: "office.reminder_policy_save", resolved: policy_input)
    assert_equal policy.id, Clinic::Reminders::PolicyVersion.current(practice: @practice).id
    service = @practice.billing_services.create!(name: "Original fee", unit_amount: "7.25", currency: "USD")
    execute(@office, "office.billing_service_details", { "service" => reference(service), "name" => "Updated synthetic fee", "code" => "UPDATED", "description" => "Recorded metadata", "active" => false })
    assert_equal "Updated synthetic fee", service.reload.name
    assert_equal false, service.active
    assert_equal BigDecimal("7.25"), service.unit_amount
    assert_equal "USD", service.currency
  end

  test "internal message preview names its recipient and confirmation service creates only internal records" do
    recipient_user = User.create!(email_address: "assistant-recipient-#{SecureRandom.hex(6)}@example.invalid", password: SecureRandom.hex(20))
    recipient = @practice.memberships.create!(user: recipient_user)
    grant_permissions!(recipient, "staff_messaging.read", scope_kind: "site", site: @site, effective_from: Time.utc(2026, 1, 1))
    employed_member(recipient, "Synthetic message recipient")
    execute(@office, "office.staff_conversation_create", { "participant" => reference(recipient) })
    conversation = Clinic::StaffConversation.where(practice: @practice).sole
    resolved = @office.resolve(key: "office.staff_message", inputs: { "conversation" => reference(conversation), "body" => "Synthetic handoff is ready." })
    assert_equal [ { label: "Internal recipient", value: "Synthetic message recipient" } ], @office.preview(key: "office.staff_message", resolved:)
    assert_empty conversation.messages
    before_version = @office.versions(key: "office.staff_message", resolved:)
    resolved["_request_key"] = "assistant-#{SecureRandom.uuid}"
    result = @office.execute(key: "office.staff_message", resolved:)
    message = conversation.messages.reload.sole
    assert_equal "Synthetic handoff is ready.", message.body
    assert_equal "routine", message.message_class
    assert_equal [ recipient.id ], message.receipts.pluck(:recipient_membership_id)
    assert_equal [ recipient.id ], message.notifications.pluck(:recipient_membership_id)
    assert_equal [ "in_app_notification" ], message.outbox_events.pluck(:event_type)
    assert_includes result.to_json, message.body
    @office.execute(key: "office.staff_message", resolved:)
    assert_equal message.id, conversation.messages.reload.sole.id
    conversation.members.find_by!(membership_id: recipient.id).update!(membership_state: "removed", removed_by_membership: @membership)
    assert_not_equal before_version, @office.versions(key: "office.staff_message", resolved:)
  end

  test "stale foreign patient and foreign site selections fail before mutation and revoked permissions are enforced" do
    service = @practice.billing_services.create!(name: "Versioned fee", unit_amount: "10.00", currency: "USD")
    stale = reference(service)
    service.update!(unit_amount: "11.00")
    assert_raises(ActiveRecord::StaleObjectError) { @operations.resolve(key: "billing.update_service", inputs: { "service" => stale, "unit_amount" => "12.00" }) }
    other_patient = @practice.patients.create!(display_name: "Other synthetic patient", reference: "OPERATIONS-002")
    foreign_invoice = @practice.invoices.create!(patient: other_patient, currency: "USD", status: "draft", rounding_policy_version: Clinic::Billing::Money::POLICY_VERSION)
    assert_raises(ActiveRecord::RecordNotFound) { @operations.resolve(key: "billing.invoice", inputs: { "invoice" => reference(foreign_invoice) }) }
    other_site = @practice.sites.create!(code: "OTHER", status: "active")
    foreign_drawer = @practice.cash_drawer_sessions.create!(site: other_site, opened_by: @actor, currency: "USD", opening_float: "0")
    assert_raises(ActiveRecord::RecordNotFound) { @office.resolve(key: "office.cash_drawer_close", inputs: { "drawer" => reference(foreign_drawer), "counted_cash" => "0" }) }
    revoke_all_permissions!(@membership)
    assert_raises(Clinic::Authorization::Denied) { @office.authorize!(key: "office.reminder_policy_save", inputs: {}) }
    assert_equal BigDecimal("11"), service.reload.unit_amount
    assert_equal "open", foreign_drawer.reload.status
  end

  private

  def reference(record)
    { "record_type" => record.class.name, "record_id" => record.id, "version" => Clinic::Assistant::ContextRegistry.record_version(record), "label" => "Synthetic selected record" }
  end

  def execute(handler, key, inputs)
    resolved = handler.resolve(key:, inputs:)
    handler.authorize!(key:, inputs: resolved)
    resolved["_request_key"] = "assistant-#{SecureRandom.uuid}"
    [ resolved, handler.execute(key:, resolved:) ]
  end

  def employed_member(membership, name)
    staff = @practice.staff_members.create!(display_name: name, job_title: "Coordinator", active: true)
    employment = Clinic::Workforce::Employment.create!(practice: @practice, staff_member: staff, membership:, status: "active", effective_from: 1.day.ago)
    employment.employment_sites.create!(practice: @practice, site: @site, active: true, effective_from: 1.day.ago)
    employment
  end

  def workforce_settings
    {
      "timezone" => "UTC", "workweek_start_day" => 1, "workweek_start_time" => "00:00",
      "kiosk_enabled" => false, "scanner_enabled" => false, "camera_enabled" => false,
      "manual_badge_entry_enabled" => false, "pin_required" => false, "break_tracking_enabled" => false,
      "schedule_enabled" => true, "employee_self_service_enabled" => true,
      "availability_editing_enabled" => false, "time_off_enabled" => false, "shift_swaps_enabled" => false,
      "availability_approval_required" => true, "time_off_approval_required" => true, "shift_swap_approval_required" => true,
      "payroll_export_enabled" => false, "break_duration_minutes" => nil, "break_reminder_minutes" => nil,
      "rounding_increment_minutes" => nil, "daily_overtime_threshold_minutes" => nil,
      "weekly_overtime_threshold_minutes" => nil, "break_mode" => "unconfigured", "break_paid" => nil,
      "rounding_mode" => "unconfigured", "overtime_precedence" => "unconfigured", "approval_mode" => "unconfigured",
      "pay_cadence" => "unconfigured", "payroll_provider" => "unconfigured", "provider_mapping" => {}
    }
  end
end
