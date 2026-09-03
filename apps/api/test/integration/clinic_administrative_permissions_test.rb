require "test_helper"

class ClinicAdministrativePermissionsTest < ActionDispatch::IntegrationTest
  setup do
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic Administrative Organization")
    @practice = Clinic::Practice.create!(name: "Synthetic Administrative Practice", organization: organization)
    @site = @practice.sites.create!(code: "MAIN")
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
    @appointment = @practice.appointments.create!(patient: @patient, site: @site,
      starts_at: 1.hour.from_now, ends_at: 90.minutes.from_now, status: "scheduled")
    login(@users.fetch("front_desk"))
  end

  test "administrative lookup exposes only bounded identity fields" do
    get "/api/clinic/patients/lookup", params: { q: @patient.reference }, headers: @headers
    assert_response :success
    row = response.parsed_body.fetch("patients").sole
    assert_equal %w[display_name id reference], row.keys.sort
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
    assert_equal %w[display_name id reference], response.parsed_body.fetch("appointments").sole.fetch("patient").keys.sort
    get "/api/clinic/invoices/#{invoice.id}", headers: @headers
    assert_response :forbidden

    login(@users.fetch("billing_operator"))
    get "/api/clinic/patients/lookup", headers: @headers
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
    Clinic::RefundEvent.create!(practice: @practice, patient: @patient, payment_event: allocation.payment_event, currency: "USD", amount: "1.50")

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
    posted_invoice = invoice
    Clinic::Billing::PostInvoice.call(invoice: posted_invoice, actor: @users.fetch("billing_operator"))
    login(@users.fetch("billing_operator"))

    post "/api/clinic/cash_drawers", params: { drawer: { site_id: @site.id, opening_float: "20.00" } },
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

    post "/api/clinic/invoices/#{posted_invoice.id}/cash_payments", params: cash_payment,
      headers: csrf_headers, as: :json
    assert_response :created
    assert_equal 1, Clinic::CashTender.count
    assert_equal 1, Clinic::BillingReceipt.where(kind: "cash_payment").count

    post "/api/clinic/payment_events/#{payment_event_id}/cash_refunds",
      params: { cash_refund: { amount: "3.00" } }, headers: csrf_headers, as: :json
    assert_response :created

    get "/api/clinic/payment_events/#{payment_event_id}/receipt", headers: @headers
    assert_response :success
    assert_equal "no-store", response.headers.fetch("Cache-Control")
    assert_includes response.body, "Payment receipt"

    get "/api/clinic/cash_drawers", headers: @headers
    assert_response :success
    drawer = response.parsed_body.fetch("drawers").sole
    assert_equal "27.0", drawer.fetch("expected_cash")
    assert_equal "3.0", drawer.fetch("cash_refunded")

    post "/api/clinic/cash_drawers/#{drawer_id}/close",
      params: { drawer: { counted_cash: "29.00", discrepancy_explanation: "Synthetic count variance" } },
      headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "closed", response.parsed_body.dig("drawer", "status")
    assert_equal "2.0", response.parsed_body.dig("drawer", "discrepancy")
  end

  test "cash replay keys preserve intent and drawers remain isolated by site" do
    posted_invoice = invoice
    Clinic::Billing::PostInvoice.call(invoice: posted_invoice, actor: @users.fetch("billing_operator"))
    second_site = @practice.sites.create!(code: "NORTH")
    login(@users.fetch("billing_operator"))

    post "/api/clinic/cash_drawers", params: { drawer: { site_id: @site.id, opening_float: "10.00" } }, headers: csrf_headers, as: :json
    assert_response :created
    first_drawer_id = response.parsed_body.dig("drawer", "id")
    post "/api/clinic/cash_drawers", params: { drawer: { site_id: @site.id, opening_float: "11.00" } }, headers: csrf_headers, as: :json
    assert_response :conflict
    post "/api/clinic/cash_drawers", params: { drawer: { site_id: second_site.id, opening_float: "12.00" } }, headers: csrf_headers, as: :json
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
    drawer = @practice.cash_drawer_sessions.create!(site: @site, opened_by: @users.fetch("billing_operator"), opening_float: "10.00")
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
    post "/api/clinic/cash_drawers", params: { drawer: { site_id: @site.id, opening_float: "10.00" } }, headers: csrf_headers, as: :json
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
    post "/api/clinic/payment_events/#{cash_payment.payment_event_id}/cash_refunds", params: { cash_refund: { amount: "10.01" } }, headers: csrf_headers, as: :json
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
    post "/api/clinic/payment_events/#{imported_payment.id}/cash_refunds", params: { cash_refund: { amount: "1.00" } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal 0, Clinic::RefundEvent.where(payment_event: imported_payment).count
  end

  test "closed drawers reject activity and read-only billing users cannot mutate them" do
    posted_invoice = invoice
    Clinic::Billing::PostInvoice.call(invoice: posted_invoice, actor: @users.fetch("billing_operator"))
    login(@users.fetch("billing_operator"))
    post "/api/clinic/cash_drawers", params: { drawer: { site_id: @site.id, opening_float: "10.00" } }, headers: csrf_headers, as: :json
    drawer_id = response.parsed_body.dig("drawer", "id")
    post "/api/clinic/cash_drawers/#{drawer_id}/close", params: { drawer: { counted_cash: "10.00" } }, headers: csrf_headers, as: :json
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
    post "/api/clinic/cash_drawers", params: { drawer: { site_id: @site.id, opening_float: "1.00" } }, headers: csrf_headers, as: :json
    assert_response :forbidden

    other_organization = Organization.create!(name: "Synthetic Other Organization")
    other_practice = Clinic::Practice.create!(name: "Synthetic Other Practice", organization: other_organization)
    other_site = other_practice.sites.create!(code: "OTHER")
    login(@users.fetch("billing_operator"))
    post "/api/clinic/cash_drawers", params: { drawer: { site_id: other_site.id, opening_float: "1.00" } }, headers: csrf_headers, as: :json
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
    assert_response :forbidden
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
