require "test_helper"

class ClinicInvoiceAdjustmentsTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Invoice Adjustments Organization")
    @practice = Clinic::Practice.create!(name: "Invoice Adjustments Practice", organization: organization)
    @patient = @practice.patients.create!(display_name: "Adjustment Patient", reference: "ADJUSTMENT-001")
    @actor = User.create!(email_address: "invoice-adjustments@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "billing.read", "billing.invoice_draft", "billing.invoice_post", "billing.payment_record")
    login(@actor)
  end

  test "credit is attributed, bounded by charges, and replay safe without issuing a refund" do
    invoice = posted_invoice("credit", amount: "10.00")
    payload = { credit: { amount: "4.00", reason: "Cancelled service", request_key: "invoice-credit-001" } }

    post "/api/clinic/invoices/#{invoice.id}/credits", params: payload, headers: csrf_headers, as: :json

    assert_response :created
    body = response.parsed_body
    credit_id = body.dig("credit", "id")
    assert_equal false, body.fetch("replayed")
    assert_equal "4.0", body.dig("credit", "amount")
    assert_equal "USD", body.dig("credit", "currency")
    assert_equal "Cancelled service", body.dig("credit", "reason")
    assert_equal @membership.id, body.dig("credit", "issued_by_membership_id")
    assert_equal "6.0", body.dig("invoice", "adjustment_limits", "credit_available_amount")
    assert_equal 0, Clinic::RefundEvent.count
    stored_reason = ApplicationRecord.connection.select_value(
      "SELECT reason FROM clinic_credit_notes WHERE id = #{ApplicationRecord.connection.quote(credit_id)}"
    )
    assert_not_equal "Cancelled service", stored_reason

    post "/api/clinic/invoices/#{invoice.id}/credits", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal true, response.parsed_body.fetch("replayed")
    assert_equal credit_id, response.parsed_body.dig("credit", "id")
    assert_equal 1, invoice.credit_notes.count

    post "/api/clinic/invoices/#{invoice.id}/credits",
      params: { credit: payload.fetch(:credit).merge(amount: "5.00") }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "idempotency_conflict", response.parsed_body.fetch("code")

    post "/api/clinic/invoices/#{invoice.id}/credits",
      params: { credit: { amount: "7.00", reason: "Additional correction", request_key: "invoice-credit-002" } },
      headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal 1, invoice.credit_notes.count

    get "/api/clinic/patients/#{@patient.id}/billing_ledger", headers: @headers
    assert_response :success
    ledger_invoice = response.parsed_body.fetch("invoices").find { |row| row.fetch("id") == invoice.id }
    assert_equal "6.0", ledger_invoice.dig("adjustment_limits", "credit_available_amount")
    assert_equal "Cancelled service", ledger_invoice.fetch("credits").sole.fetch("reason")
    assert @practice.audit_events.where(action_code: "billing.invoice_credit", outcome: "committed").exists?
  end

  test "void is replay safe and rejects invoices with financial activity" do
    invoice = posted_invoice("void")
    payload = { invoice_void: { reason: "Charge entered in error", request_key: "invoice-void-001" } }

    post "/api/clinic/invoices/#{invoice.id}/void", params: payload, headers: csrf_headers, as: :json

    assert_response :success
    body = response.parsed_body
    assert_equal false, body.fetch("replayed")
    assert_equal "void", body.dig("invoice", "status")
    assert_equal "0.0", body.dig("invoice", "balance_amount")
    assert_equal "Charge entered in error", body.dig("invoice", "void_reason")
    assert_equal @membership.id, body.dig("invoice", "voided_by_membership_id")
    assert_equal false, body.dig("invoice", "adjustment_limits", "void_eligible")

    post "/api/clinic/invoices/#{invoice.id}/void", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal true, response.parsed_body.fetch("replayed")
    assert_equal 1, Clinic::OperationReceipt.where(operation_code: "billing.invoice_void", request_key: "invoice-void-001").count

    paid = posted_invoice("paid")
    Clinic::Billing::AllocatePayment.call(
      practice: @practice, actor: @actor, patient: @patient, invoice: paid,
      external_event_reference: "invoice-adjustment-payment", currency: "USD", amount: "10.00"
    )
    assert_void_rejected(paid, "invoice-void-paid")

    credited = posted_invoice("credited")
    Clinic::Billing::InvoiceAdjustments.credit(
      invoice: credited, actor: @actor, amount: "1.00", reason: "Prior correction",
      request_key: "invoice-credit-before-void"
    )
    assert_void_rejected(credited, "invoice-void-credited")

    collecting = posted_invoice("collecting")
    @practice.payment_collection_intents.create!(
      patient: @patient, invoice: collecting, reference: "ci_#{SecureRandom.hex(16)}",
      request_key: "invoice-adjustment-intent", processor: "stripe", mode: "test",
      currency: "USD", amount: "10.00", state: "pending"
    )
    assert_void_rejected(collecting, "invoice-void-collecting")

    failed_collection = posted_invoice("failed-collection")
    @practice.payment_collection_intents.create!(
      patient: @patient, invoice: failed_collection, reference: "ci_#{SecureRandom.hex(16)}",
      request_key: "invoice-adjustment-failed-intent", processor: "stripe", mode: "test",
      currency: "USD", amount: "10.00", state: "failed"
    )
    post "/api/clinic/invoices/#{failed_collection.id}/void",
      params: { invoice_void: { reason: "No completed collection", request_key: "invoice-void-failed-collection" } },
      headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "void", failed_collection.reload.status
    assert @practice.audit_events.where(action_code: "billing.invoice_void", outcome: "committed").exists?
  end

  test "invoice adjustment endpoints remain practice scoped and require posting authority" do
    invoice = posted_invoice("authority")
    reader = User.create!(email_address: "invoice-adjustment-reader@example.invalid", password: @password)
    reader_membership = @practice.memberships.create!(user: reader)
    grant_permissions!(reader_membership, "billing.read")
    login(reader)

    post "/api/clinic/invoices/#{invoice.id}/credits",
      params: { credit: { amount: "1.00", reason: "Not authorized", request_key: "invoice-credit-denied" } },
      headers: csrf_headers, as: :json
    assert_response :forbidden
    assert_empty invoice.credit_notes

    other_organization = Organization.create!(name: "Other Invoice Adjustments Organization")
    other_practice = Clinic::Practice.create!(name: "Other Invoice Adjustments Practice", organization: other_organization)
    other_patient = other_practice.patients.create!(display_name: "Other Patient", reference: "ADJUSTMENT-OTHER")
    other_actor = User.create!(email_address: "other-invoice-adjustments@example.invalid", password: @password)
    other_membership = other_practice.memberships.create!(user: other_actor)
    grant_permissions!(other_membership, "billing.invoice_draft", "billing.invoice_post")
    other_invoice = Clinic::Billing::DraftInvoice.call(
      practice: other_practice, actor: other_actor, patient: other_patient, currency: "USD",
      lines: [ { quantity: "1", unit_amount: "10.00", description_snapshot: "Other service" } ],
      request_key: "other-invoice-adjustment-draft"
    )
    Clinic::Billing::PostInvoice.call(invoice: other_invoice, actor: other_actor, request_key: "other-invoice-adjustment-post")

    login(@actor)
    post "/api/clinic/invoices/#{other_invoice.id}/void",
      params: { invoice_void: { reason: "Wrong practice", request_key: "invoice-void-other" } },
      headers: csrf_headers, as: :json
    assert_response :not_found
  end

  private

  def posted_invoice(label, amount: "10.00")
    invoice = Clinic::Billing::DraftInvoice.call(
      practice: @practice, actor: @actor, patient: @patient, currency: "USD",
      lines: [ { quantity: "1", unit_amount: amount, description_snapshot: "#{label} service" } ],
      request_key: "invoice-adjustment-draft-#{label}"
    )
    Clinic::Billing::PostInvoice.call(
      invoice: invoice, actor: @actor, request_key: "invoice-adjustment-post-#{label}"
    )
  end

  def assert_void_rejected(invoice, request_key)
    post "/api/clinic/invoices/#{invoice.id}/void",
      params: { invoice_void: { reason: "Should remain posted", request_key: request_key } },
      headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal "posted", invoice.reload.status
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
