require "test_helper"

class ClinicAdministrativePermissionsTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic Administrative Organization")
    @practice = Clinic::Practice.create!(name: "Synthetic Administrative Practice", organization: organization)
    @site = @practice.sites.create!(code: "MAIN", status: "active")
    @patient = @practice.patients.create!(display_name: "SYN_Admin, Avery", reference: "SYN-ADMIN-001")
    @users = %w[front_desk scheduler billing_operator].to_h do |role|
      user = User.create!(email_address: "admin-#{role}@example.invalid", password: @password)
      membership = @practice.memberships.create!(user: user)
      permissions = case role
      when "billing_operator" then %w[patients.identity.read billing.read billing.invoice_draft billing.invoice_post billing.payment_record]
      else %w[patients.identity.read appointments.read appointments.book appointments.status_transition]
      end
      grant_permissions!(membership, *permissions)
      [ role, user ]
    end
    @scheduler_membership = @practice.memberships.find_by!(user: @users.fetch("scheduler"))
    @clinician = @practice.clinician_profiles.create!(membership: @scheduler_membership,
      display_name: "Synthetic scheduling clinician")
    configure_site!(@site, membership: @scheduler_membership)
    @visit_type = @practice.visit_types.create!(code: "SYN-ADMIN-VISIT")
    appointment_start = 1.hour.from_now
    capacity_start = appointment_start.in_time_zone(@practice.timezone)
    Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
      kind: "weekly", weekday: capacity_start.wday, start_minute: 0, end_minute: 1440, active: true)
    @appointment = @practice.appointments.create!(patient: @patient, site: @site,
      starts_at: appointment_start, ends_at: appointment_start + 30.minutes, status: "scheduled")
    login(@users.fetch("front_desk"))
  end

  test "administrative lookup exposes only bounded identity fields" do
    get "/api/clinic/patients/lookup", params: { q: @patient.reference }, headers: @headers
    assert_response :success
    row = response.parsed_body.fetch("patients").sole
    assert_equal %w[date_of_birth display_name id phone_hint primary_site_id reference], row.keys.sort
    assert_equal @patient.id, row.fetch("id")
    get "/api/clinic/patients/#{@patient.id}", headers: @headers
    assert_response :forbidden
  end

  test "front desk and scheduler are scheduling-only and billing operator is billing-only" do
    get "/api/clinic/facilities", params: { type: "visit_types" }, headers: @headers
    assert_response :success
    get "/api/clinic/clinicians", headers: @headers
    assert_response :success
    get "/api/clinic/appointments", headers: @headers
    assert_response :success
    assert_equal %w[display_name id phone reference], response.parsed_body.fetch("appointments").sole.fetch("patient").keys.sort
    get "/api/clinic/invoices/#{invoice.id}", headers: @headers
    assert_response :forbidden

    login(@users.fetch("billing_operator"))
    get "/api/clinic/patients/lookup", params: { q: @patient.reference }, headers: @headers
    assert_response :success
    get "/api/clinic/appointments", headers: @headers
    assert_response :forbidden
    get "/api/clinic/invoices/#{invoice.id}", headers: @headers
    assert_response :success
    get "/api/clinic/patients/#{@patient.id}/invoices", headers: @headers
    assert_response :success
    row = response.parsed_body.fetch("invoices").sole
    assert_equal "10.0", row.fetch("total_amount")
    assert_equal "0.0", row.fetch("allocated_amount")
    assert_equal "0.0", row.fetch("credit_amount")
    assert_equal "10.0", row.fetch("balance_amount")
    assert_not row.key?("lines")
  end

  test "billing operator can read a patient-scoped ledger without processor references" do
    posted_invoice = invoice
    Clinic::Billing::PostInvoice.call(invoice: posted_invoice, actor: @users.fetch("billing_operator"))
    allocation = Clinic::Billing::AllocatePayment.call(
      practice: @practice, actor: @users.fetch("billing_operator"), patient: @patient,
      invoice: posted_invoice, external_event_reference: "SYN-PROCESSOR-REFERENCE",
      currency: "USD", amount: "7.00"
    )
    Clinic::CreditNote.create!(practice: @practice, patient: @patient, invoice: posted_invoice, currency: "USD", amount: "2.00")
    Clinic::RefundEvent.create!(practice: @practice, patient: @patient, payment_event: allocation.payment_event, currency: "USD", amount: "1.50", reason: "Fixture refund")

    login(@users.fetch("billing_operator"))
    get "/api/clinic/patients/#{@patient.id}/billing_ledger", headers: @headers
    assert_response :success

    ledger = response.parsed_body
    assert_equal "clinic-patient-ledger-v1", ledger.fetch("schema_version")
    assert_equal @patient.id, ledger.dig("patient", "id")
    assert_equal "1.0", ledger.fetch("currencies").sole.fetch("balance_amount")
    invoice_row = ledger.fetch("invoices").sole
    assert_equal "10.0", invoice_row.fetch("total_amount")
    assert_equal "7.0", invoice_row.fetch("allocated_amount")
    assert_equal "2.0", invoice_row.fetch("credit_amount")
    assert_equal "1.0", invoice_row.fetch("balance_amount")
    payment = ledger.fetch("payments").sole
    assert_equal "1.5", payment.fetch("refunds").sole.fetch("amount")
    assert_equal false, payment.fetch("cash_payment")
    assert_equal false, payment.fetch("receipt_available")
    assert_not payment.key?("external_event_reference")
  end

  test "cash collection, refund, receipt, and drawer close preserve the recorded cash trail" do
    receipt_zone = Time.find_zone!("America/Chicago")
    receipt_date = Time.current.in_time_zone(receipt_zone).to_date.next_day
    recorded_at = receipt_zone.local(receipt_date.year, receipt_date.month, receipt_date.day, 4, 47).utc
    travel_to recorded_at
    @practice.update!(timezone: "America/Chicago")
    posted_invoice = invoice
    Clinic::Billing::PostInvoice.call(invoice: posted_invoice, actor: @users.fetch("billing_operator"))
    login(@users.fetch("billing_operator"))

    post "/api/clinic/cash_drawers", params: { drawer: { site_id: @site.id, opening_float: "20.00", currency: "USD" } },
      headers: csrf_headers, as: :json
    assert_response :created
    drawer_id = response.parsed_body.dig("drawer", "id")

    cash_payment = {
      cash_payment: {
        cash_drawer_session_id: drawer_id,
        tendered_amount: "15.00",
        allocation_amount: "10.00",
        request_key: "SYN-CASH-001"
      }
    }
    post "/api/clinic/invoices/#{posted_invoice.id}/cash_payments", params: cash_payment,
      headers: csrf_headers, as: :json
    assert_response :created
    payment_event_id = Clinic::PaymentEvent.find_by!(external_event_reference: "cash:#{drawer_id}:SYN-CASH-001").id
    assert_equal "5.0", response.parsed_body.dig("cash_tender", "change_amount")
    payment_receipt = Clinic::BillingReceipt.find_by!(payment_event_id: payment_event_id, kind: "cash_payment")
    assert_equal recorded_at, Clinic::PaymentEvent.find(payment_event_id).created_at
    assert_equal recorded_at, payment_receipt.issued_at

    travel_to recorded_at + 36.minutes do
      post "/api/clinic/invoices/#{posted_invoice.id}/cash_payments", params: cash_payment,
        headers: csrf_headers, as: :json
      assert_response :created
      assert_equal recorded_at, Clinic::PaymentEvent.find(payment_event_id).created_at
      assert_equal recorded_at, payment_receipt.reload.issued_at
      get "/api/clinic/payment_events/#{payment_event_id}/receipt", headers: @headers
      assert_response :success
      issued = Nokogiri::HTML(response.body).at_xpath("//dt[normalize-space()='Issued']/following-sibling::dd")
      assert issued, "Receipt must retain the Issued field"
      assert_equal "#{receipt_date.strftime('%B %-d, %Y')} · 4:47 AM #{recorded_at.in_time_zone(receipt_zone).strftime('%Z')}", issued.text.strip
    end
    assert_equal 1, Clinic::CashTender.count
    assert_equal 1, Clinic::BillingReceipt.where(kind: "cash_payment").count

    refund = { cash_refund: { amount: "3.00", reason: "Fixture cash return", request_key: "SYN-CASH-REFUND-001" } }
    post "/api/clinic/payment_events/#{payment_event_id}/cash_refunds",
      params: refund, headers: csrf_headers, as: :json
    assert_response :created
    refund_id = response.parsed_body.dig("refund", "id")
    refund_receipt_id = response.parsed_body.fetch("receipt_id")
    assert_equal false, response.parsed_body.fetch("replayed")
    assert_equal "Fixture cash return", response.parsed_body.dig("refund", "reason")
    assert_equal "Fixture cash return", Clinic::RefundEvent.find(refund_id).reason

    post "/api/clinic/payment_events/#{payment_event_id}/cash_refunds",
      params: refund, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal true, response.parsed_body.fetch("replayed")
    assert_equal refund_id, response.parsed_body.dig("refund", "id")
    assert_equal refund_receipt_id, response.parsed_body.fetch("receipt_id")
    assert_equal "SYN-CASH-REFUND-001", response.parsed_body.fetch("request_key")
    assert_equal 1, Clinic::RefundEvent.where(payment_event_id: payment_event_id).count
    assert_equal 1, Clinic::BillingReceipt.where(payment_event_id: payment_event_id, kind: "cash_refund").count
    assert_equal 1, Clinic::OperationReceipt.where(operation_code: "billing.cash_refund", request_key: "SYN-CASH-REFUND-001").count
    assert @practice.audit_events.where(action_code: "billing.cash_refund", outcome: "committed").exists?

    post "/api/clinic/payment_events/#{payment_event_id}/cash_refunds",
      params: { cash_refund: { amount: "2.00", reason: "Changed fixture return", request_key: "SYN-CASH-REFUND-001" } }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "idempotency_conflict", response.parsed_body.fetch("code")
    assert_equal 1, Clinic::RefundEvent.where(payment_event_id: payment_event_id).count

    get "/api/clinic/payment_events/#{payment_event_id}/receipt", headers: @headers
    assert_response :success
    assert_equal "no-store", response.headers.fetch("Cache-Control")
    assert_includes response.body, "Payment receipt"
    assert_includes response.body, "Fixture cash return"
    nonce = Nokogiri::HTML(response.body).at_css("style")["nonce"]
    assert nonce.present?
    assert_includes response.headers.fetch("Content-Security-Policy"), "'nonce-#{nonce}'"
    assert_select "script[nonce=?]", nonce, count: 1
    assert_not_includes response.headers.fetch("Content-Security-Policy"), "'unsafe-inline'"

    get "/api/clinic/cash_drawers", headers: @headers
    assert_response :success
    drawer = response.parsed_body.fetch("drawers").sole
    assert_equal "27.0", drawer.fetch("expected_cash")
    assert_equal "3.0", drawer.fetch("cash_refunded")

    post "/api/clinic/cash_drawers/#{drawer_id}/close",
      params: { drawer: { counted_cash: "29.00", discrepancy_explanation: "Synthetic count variance", request_key: "SYN-CASH-CLOSE-001" } },
      headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "closed", response.parsed_body.dig("drawer", "status")
    assert_equal "2.0", response.parsed_body.dig("drawer", "discrepancy")

    post "/api/clinic/payment_events/#{payment_event_id}/cash_refunds",
      params: { cash_refund: { amount: "1.00", reason: "Closed drawer fixture", request_key: "SYN-CLOSED-REFUND-001" } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "closed"
    assert_equal 1, Clinic::RefundEvent.where(payment_event_id: payment_event_id).count

    manager = administrative_user("cash-manager", "billing.read", "billing.cash_reconcile")
    login(manager)
    get "/api/clinic/cash_drawers", headers: @headers
    assert_response :success
    post "/api/clinic/cash_drawers/#{drawer_id}/reconcile",
      params: { drawer: { reconciliation_note: "Synthetic manager reviewed the variance", request_key: "SYN-RECONCILE-001" } },
      headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "reconciled", response.parsed_body.dig("drawer", "reconciliation_status")
    assert_equal "2.0", response.parsed_body.dig("drawer", "discrepancy")
  end

  test "cash replay keys preserve intent and drawers remain isolated by site" do
    posted_invoice = invoice
    Clinic::Billing::PostInvoice.call(invoice: posted_invoice, actor: @users.fetch("billing_operator"))
    second_site = @practice.sites.create!(code: "NORTH")
    login(@users.fetch("billing_operator"))

    post "/api/clinic/cash_drawers", params: { drawer: { site_id: @site.id, opening_float: "10.00", currency: "USD" } }, headers: csrf_headers, as: :json
    assert_response :created
    first_drawer_id = response.parsed_body.dig("drawer", "id")
    post "/api/clinic/cash_drawers", params: { drawer: { site_id: @site.id, opening_float: "11.00", currency: "USD" } }, headers: csrf_headers, as: :json
    assert_response :conflict
    post "/api/clinic/cash_drawers", params: { drawer: { site_id: second_site.id, opening_float: "12.00", currency: "USD" } }, headers: csrf_headers, as: :json
    assert_response :created
    second_drawer_id = response.parsed_body.dig("drawer", "id")

    payment = { cash_payment: { cash_drawer_session_id: first_drawer_id, tendered_amount: "10.00", allocation_amount: "10.00", request_key: "SYN-REPLAY-001" } }
    post "/api/clinic/invoices/#{posted_invoice.id}/cash_payments", params: payment, headers: csrf_headers, as: :json
    assert_response :created
    payment[:cash_payment][:cash_drawer_session_id] = second_drawer_id
    post "/api/clinic/invoices/#{posted_invoice.id}/cash_payments", params: payment, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "do not match"
    assert_equal 1, Clinic::CashTender.where(request_key: "SYN-REPLAY-001").count
  end

  test "cash payment rolls back every linked record when receipt persistence fails" do
    posted_invoice = invoice
    Clinic::Billing::PostInvoice.call(invoice: posted_invoice, actor: @users.fetch("billing_operator"))
    drawer = @practice.cash_drawer_sessions.create!(site: @site, opened_by: @users.fetch("billing_operator"), opening_float: "10.00", currency: "USD")
    before = [ Clinic::PaymentEvent.count, Clinic::PaymentAllocation.count, Clinic::CashTender.count, Clinic::BillingReceipt.count ]

    original_receipt_create = Clinic::BillingReceipt.method(:create!)
    Clinic::BillingReceipt.singleton_class.define_method(:create!) { |*| raise RuntimeError, "synthetic receipt failure" }
    begin
      assert_raises(RuntimeError) do
        Clinic::Billing::RecordCashPayment.call(
          practice: @practice, actor: @users.fetch("billing_operator"), patient: @patient, invoice: posted_invoice,
          drawer_session: drawer, tendered_amount: "10.00", allocation_amount: "10.00", request_key: "SYN-ROLLBACK-001"
        )
      end
    ensure
      Clinic::BillingReceipt.singleton_class.define_method(:create!, original_receipt_create)
    end

    assert_equal before, [ Clinic::PaymentEvent.count, Clinic::PaymentAllocation.count, Clinic::CashTender.count, Clinic::BillingReceipt.count ]
  end

  test "cash payment and refund reject forged or invalid financial inputs" do
    posted_invoice = invoice
    Clinic::Billing::PostInvoice.call(invoice: posted_invoice, actor: @users.fetch("billing_operator"))
    login(@users.fetch("billing_operator"))
    post "/api/clinic/cash_drawers", params: { drawer: { site_id: @site.id, opening_float: "10.00", currency: "USD" } }, headers: csrf_headers, as: :json
    drawer_id = response.parsed_body.dig("drawer", "id")

    post "/api/clinic/invoices/#{posted_invoice.id}/cash_payments",
      params: { cash_payment: { cash_drawer_session_id: drawer_id, tendered_amount: "-1.00", allocation_amount: "1.00", request_key: "SYN-INVALID-001" } },
      headers: csrf_headers, as: :json
    assert_response :bad_request
    assert_equal 0, Clinic::CashTender.count

    cash_payment = Clinic::Billing::RecordCashPayment.call(
      practice: @practice, actor: @users.fetch("billing_operator"), patient: @patient, invoice: posted_invoice,
      drawer_session: @practice.cash_drawer_sessions.find(drawer_id), tendered_amount: "10.00", allocation_amount: "10.00", request_key: "SYN-REFUND-001"
    )
    post "/api/clinic/payment_events/#{cash_payment.payment_event_id}/cash_refunds",
      params: { cash_refund: { amount: "1.00", request_key: "SYN-REFUND-MISSING-REASON-001" } }, headers: csrf_headers, as: :json
    assert_response :bad_request
    assert_equal 0, Clinic::RefundEvent.count

    post "/api/clinic/payment_events/#{cash_payment.payment_event_id}/cash_refunds",
      params: { cash_refund: { amount: "10.01", reason: "Overage fixture", request_key: "SYN-REFUND-OVERAGE-001" } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal 0, Clinic::RefundEvent.count

    other_invoice = Clinic::Billing::DraftInvoice.call(
      practice: @practice, actor: @users.fetch("billing_operator"), patient: @patient,
      currency: "USD", lines: [ { quantity: "1", unit_amount: "2", description_snapshot: "Synthetic non-cash refund test" } ]
    )
    Clinic::Billing::PostInvoice.call(invoice: other_invoice, actor: @users.fetch("billing_operator"))
    imported_payment = Clinic::Billing::AllocatePayment.call(
      practice: @practice, actor: @users.fetch("billing_operator"), patient: @patient, invoice: other_invoice,
      external_event_reference: "SYN-IMPORTED-REFUND", currency: "USD", amount: "2.00"
    ).payment_event
    post "/api/clinic/payment_events/#{imported_payment.id}/cash_refunds",
      params: { cash_refund: { amount: "1.00", reason: "Non-cash fixture", request_key: "SYN-NON-CASH-REFUND-001" } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal 0, Clinic::RefundEvent.where(payment_event: imported_payment).count
  end

  test "closed drawers reject activity and read-only billing users cannot mutate them" do
    posted_invoice = invoice
    Clinic::Billing::PostInvoice.call(invoice: posted_invoice, actor: @users.fetch("billing_operator"))
    login(@users.fetch("billing_operator"))
    post "/api/clinic/cash_drawers", params: { drawer: { site_id: @site.id, opening_float: "10.00", currency: "USD" } }, headers: csrf_headers, as: :json
    drawer_id = response.parsed_body.dig("drawer", "id")
    post "/api/clinic/cash_drawers/#{drawer_id}/close", params: { drawer: { counted_cash: "10.00", request_key: "SYN-DRAWER-CLOSE" } }, headers: csrf_headers, as: :json
    assert_response :success

    post "/api/clinic/invoices/#{posted_invoice.id}/cash_payments",
      params: { cash_payment: { cash_drawer_session_id: drawer_id, tendered_amount: "10.00", allocation_amount: "10.00", request_key: "SYN-CLOSED-001" } },
      headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "closed"

    reader = administrative_user("billing-reader-cash", "billing.read")
    login(reader)
    get "/api/clinic/cash_drawers", headers: @headers
    assert_response :forbidden
    post "/api/clinic/cash_drawers", params: { drawer: { site_id: @site.id, opening_float: "1.00", currency: "USD" } }, headers: csrf_headers, as: :json
    assert_response :forbidden

    other_organization = Organization.create!(name: "Synthetic Other Organization")
    other_practice = Clinic::Practice.create!(name: "Synthetic Other Practice", organization: other_organization)
    other_site = other_practice.sites.create!(code: "OTHER")
    login(@users.fetch("billing_operator"))
    post "/api/clinic/cash_drawers", params: { drawer: { site_id: other_site.id, opening_float: "1.00", currency: "USD" } }, headers: csrf_headers, as: :json
    assert_response :not_found
  end

  test "context reports atomic capabilities and staff write stays false" do
    get "/api/clinic/context", headers: @headers
    capabilities = response.parsed_body.fetch("capabilities")
    assert_equal true, capabilities.fetch("patient_identity_read")
    assert_equal true, capabilities.fetch("appointments_read")
    assert_equal true, capabilities.fetch("appointments_book")
    assert_equal true, capabilities.fetch("appointments_status_transition")
    assert_equal false, capabilities.fetch("billing_read")
    assert_equal false, capabilities.fetch("staff_write")
  end

  test "identity permission cannot generic-read a patient" do
    assert_equal false, Ability.new(@users.fetch("front_desk"), practice: @practice).can?(:read, @patient)
    assert_equal true, Ability.new(@users.fetch("front_desk"), practice: @practice).can?(:read_identity, @patient)
  end

  test "appointment read and booking remain separate atomic actions" do
    reader = administrative_user("schedule-reader", "patients.identity.read", "appointments.read")
    login(reader)
    get "/api/clinic/appointments", headers: @headers
    assert_response :success
    post "/api/clinic/appointments", params: appointment_payload, headers: csrf_headers, as: :json
    assert_response :forbidden
    assert @practice.audit_events.where(action_code: "appointments.book", outcome: "denied").exists?

    login(@users.fetch("scheduler"))
    post "/api/clinic/appointments", params: appointment_payload, headers: csrf_headers, as: :json
    assert_response :created
  end

  test "upcoming appointment search excludes past and cancelled schedule rows" do
    other_patient = @practice.patients.create!(display_name: "SYN_Admin, Blair", reference: "SYN-ADMIN-002")
    @practice.appointments.create!(patient: @patient, site: @site,
      starts_at: 1.day.ago, ends_at: 1.day.ago + 30.minutes, status: "scheduled")
    @practice.appointments.create!(patient: @patient, site: @site,
      starts_at: 2.hours.from_now, ends_at: 150.minutes.from_now, status: "cancelled")
    @practice.appointments.create!(patient: other_patient, site: @site,
      starts_at: 3.hours.from_now, ends_at: 210.minutes.from_now, status: "confirmed")

    get "/api/clinic/appointments", params: {
      upcoming: "true",
      from: 1.day.ago.iso8601,
      to: 1.day.from_now.iso8601,
      q: "Avery"
    }, headers: @headers

    assert_response :success
    assert_equal [ @appointment.id ], response.parsed_body.fetch("appointments").map { |row| row.fetch("id") }
  end

  test "billing actions are atomic and legacy billing write remains compatible" do
    reader = administrative_user("billing-reader", "patients.identity.read", "billing.read")
    login(reader)
    get "/api/clinic/invoices/#{invoice.id}", headers: @headers
    assert_response :success
    get "/api/clinic/billing", headers: @headers
    assert_response :success
    post "/api/clinic/patients/#{@patient.id}/invoices", params: invoice_payload,
      headers: csrf_headers, as: :json
    assert_response :forbidden
    assert @practice.audit_events.where(action_code: "billing.invoice_draft", outcome: "denied").exists?

    drafter = administrative_user("billing-drafter", "billing.invoice_draft")
    login(drafter)
    post "/api/clinic/patients/#{@patient.id}/invoices", params: invoice_payload,
      headers: csrf_headers, as: :json
    assert_response :created
    atomic_invoice_id = response.parsed_body.dig("invoice", "id")
    post "/api/clinic/invoices/#{atomic_invoice_id}/post", headers: csrf_headers, as: :json
    assert_response :forbidden
    assert @practice.audit_events.where(action_code: "billing.invoice_post", outcome: "denied").exists?

    legacy = administrative_user("legacy-billing-writer", "billing.write")
    login(legacy)
    get "/api/clinic/billing", headers: @headers
    assert_response :success
    post "/api/clinic/patients/#{@patient.id}/invoices", params: invoice_payload,
      headers: csrf_headers, as: :json
    assert_response :created
    legacy_invoice_id = response.parsed_body.dig("invoice", "id")
    post "/api/clinic/invoices/#{legacy_invoice_id}/post", headers: csrf_headers, as: :json
    assert_response :success
    post "/api/clinic/invoices/#{legacy_invoice_id}/payment_allocations",
      params: { payment: { external_event_reference: "SYN-LEGACY-PAYMENT", currency: "USD", amount: "5.00" } },
      headers: csrf_headers, as: :json
    assert_response :created
  end

  test "legacy patients reader retains existing appointment visibility" do
    legacy = User.create!(email_address: "legacy-schedule-reader@example.invalid", password: @password)
    membership = @practice.memberships.create!(user: legacy)
    grant_permissions!(membership, "patients.read")
    login(legacy)
    get "/api/clinic/appointments/#{@appointment.id}", headers: @headers
    assert_response :success
    assert_equal @appointment.id, response.parsed_body.dig("appointment", "id")
  end

  test "revoked atomic grant denies lookup" do
    membership = @users.fetch("front_desk").clinic_membership
    grant = permission_grant!(membership, "patients.identity.read")
    grant.update!(revoked_at: Time.current, revision: grant.revision + 1)
    get "/api/clinic/patients/lookup", headers: @headers
    assert_response :forbidden
  end

  test "patient statement renders authoritative currency ledger with tenant permission CSP and no store fences" do
    actor = @users.fetch("billing_operator")
    posted_invoice = invoice
    Clinic::Billing::PostInvoice.call(invoice: posted_invoice, actor: actor)
    allocation = Clinic::Billing::AllocatePayment.call(
      practice: @practice, actor: actor, patient: @patient, invoice: posted_invoice,
      external_event_reference: "SYN-STATEMENT-PAYMENT", currency: "USD", amount: "7.00"
    )
    Clinic::CreditNote.create!(practice: @practice, patient: @patient, invoice: posted_invoice, currency: "USD", amount: "2.00")
    Clinic::RefundEvent.create!(practice: @practice, patient: @patient, payment_event: allocation.payment_event,
      currency: "USD", amount: "1.50", reason: "Synthetic statement refund")
    euro = Clinic::Billing::DraftInvoice.call(practice: @practice, actor: actor, patient: @patient,
      currency: "EUR", lines: [ { quantity: "1", unit_amount: "3.25", description_snapshot: "Synthetic separate currency service" } ])
    Clinic::Billing::PostInvoice.call(invoice: euro, actor: actor)
    draft = Clinic::Billing::DraftInvoice.call(practice: @practice, actor: actor, patient: @patient,
      currency: "USD", lines: [ { quantity: "1", unit_amount: "900", description_snapshot: "Synthetic unposted excluded charge" } ])
    login(actor)
    get "/api/clinic/patients/#{@patient.id}/billing_ledger", headers: @headers
    assert_response :success
    currencies = response.parsed_body.fetch("currencies").index_by { |row| row.fetch("currency") }
    assert_equal "1.0", currencies.fetch("USD").fetch("balance_amount")
    assert_equal "3.25", currencies.fetch("EUR").fetch("balance_amount")
    assert_no_difference [ -> { Clinic::Invoice.count }, -> { Clinic::PaymentEvent.count },
      -> { Clinic::CreditNote.count }, -> { Clinic::RefundEvent.count } ] do
      get "/api/clinic/patients/#{@patient.id}/billing_statement", headers: @headers
      assert_response :success
    end
    assert_equal "text/html", response.media_type
    assert_equal "no-store", response.headers.fetch("Cache-Control")
    document = Nokogiri::HTML(response.body)
    assert_includes document.text, @patient.display_name
    assert_includes document.text, "USD 1.00 due"
    assert_includes document.text, "EUR 3.25 due"
    assert_includes document.text, "Applied payments: 7.0"
    assert_includes document.text, "Credits: 2.0"
    assert_includes document.text, "Refunds: 1.5"
    assert_not_includes document.text, "Synthetic unposted excluded charge"
    assert_includes document.text, "Synthetic separate currency service"
    invoice_rows = document.css("table").first.css("tbody tr")
    assert_equal 2, invoice_rows.length
    assert_not invoice_rows.any? { |row| row.css("td").first.text == "##{draft.id}" }
    nonce = document.at_css("style")["nonce"]
    assert nonce.present?
    assert_includes response.headers.fetch("Content-Security-Policy"), "'nonce-#{nonce}'"
    assert_not_includes response.headers.fetch("Content-Security-Policy"), "'unsafe-inline'"
    assert_equal 1, document.css("script[nonce]").length
    assert_equal nonce, document.at_css("script[nonce]")["nonce"]
    assert_includes document.at_css("script[nonce]").text, "window.print()"
    assert_equal "Print statement", document.at_css("button#print-statement").text

    foreign = Clinic::Practice.create!(name: "Synthetic foreign statement practice").patients.create!(
      display_name: "Synthetic foreign statement patient", reference: "SYN-FOREIGN-STATEMENT")
    get "/api/clinic/patients/#{foreign.id}/billing_statement", headers: @headers
    assert_response :not_found
    assert_not_includes response.body, foreign.display_name
    login(@users.fetch("front_desk"))
    get "/api/clinic/patients/#{@patient.id}/billing_statement", headers: @headers
    assert_response :forbidden
    assert_not_includes response.body, @patient.display_name
    billing_only = administrative_user("statement-billing-only", "billing.read")
    login(billing_only)
    get "/api/clinic/patients/#{@patient.id}/billing_statement", headers: @headers
    assert_response :success
    legacy = administrative_user("statement-legacy-billing", "billing.write")
    login(legacy)
    get "/api/clinic/patients/#{@patient.id}/billing_statement", headers: @headers
    assert_response :success
  end

  private

  def invoice
    @invoice ||= Clinic::Billing::DraftInvoice.call(practice: @practice, actor: @users.fetch("billing_operator"), patient: @patient,
      currency: "USD", lines: [ { quantity: "1", unit_amount: "10", description_snapshot: "Synthetic administrative service" } ])
  end

  def administrative_user(label, *permissions)
    user = User.create!(email_address: "#{label}@example.invalid", password: @password)
    membership = @practice.memberships.create!(user: user)
    grant_permissions!(membership, *permissions)
    user
  end

  def appointment_payload
    {
      appointment: {
        patient_id: @patient.id,
        site_id: @site.id,
        booked_clinician_id: @clinician.id,
        visit_type_id: @visit_type.id,
        starts_at: 3.hours.from_now.iso8601,
        ends_at: 4.hours.from_now.iso8601
      }
    }
  end

  def invoice_payload
    {
      invoice: {
        currency: "USD",
        lines: [ { quantity: "1", unit_amount: "25.00", description_snapshot: "Synthetic administrative service" } ]
      }
    }
  end

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
