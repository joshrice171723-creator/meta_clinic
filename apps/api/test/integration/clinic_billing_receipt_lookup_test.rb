require "test_helper"

class ClinicBillingReceiptLookupTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic Receipt Organization")
    @practice = Clinic::Practice.create!(name: "Synthetic Receipt Practice", organization: organization)
    @patient = @practice.patients.create!(display_name: "Synthetic Receipt Patient", reference: "SYN-RECEIPT")
    @actor = User.create!(email_address: "billing-receipt-lookup@example.invalid", password: @password)
    membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(membership, "billing.read", "billing.invoice_draft", "billing.invoice_post", "billing.cash_reconcile")
    @invoice = Clinic::Billing::DraftInvoice.call(practice: @practice, actor: @actor, patient: @patient,
      currency: "USD", lines: [ { quantity: "1", unit_amount: "10.00", description_snapshot: "Synthetic receipt charge" } ])
    Clinic::Billing::PostInvoice.call(invoice: @invoice, actor: @actor)
    login(@actor)
  end

  test "default payment receipts include cards and explicit refund receipts remain available" do
    %w[cash_payment subscription_payment card_payment].each do |kind|
      payment, receipt = payment_receipt(kind)
      get "/api/clinic/payment_events/#{payment.id}/receipt", headers: @headers
      assert_response :success
      assert_equal "no-store", response.headers.fetch("Cache-Control")
      assert_includes response.body, "Payment receipt"
      assert_includes response.body, "Receipt ##{receipt.id}"
      assert_includes response.body, "USD 10.00"

      next unless kind == "cash_payment"

      refund_receipt = Clinic::BillingReceipt.create!(practice: @practice, patient: @patient, invoice: @invoice,
        payment_event: payment, issued_by: @actor, kind: "cash_refund", issued_at: Time.current,
        payload: { "amount" => "2.00", "currency" => "USD", "reason" => "Synthetic explicit refund" })
      get "/api/clinic/payment_events/#{payment.id}/receipt", params: { receipt_id: refund_receipt.id }, headers: @headers
      assert_response :success
      assert_includes response.body, "Refund receipt"
      assert_includes response.body, "USD 2.00"
      get "/api/clinic/payment_events/#{payment.id}/receipt", headers: @headers
      assert_response :success
      assert_includes response.body, "Receipt ##{receipt.id}"
    end
  end

  test "default card receipt remains authorized and practice scoped" do
    payment, = payment_receipt("card_payment")
    reader = User.create!(email_address: "denied-billing-receipt@example.invalid", password: @password)
    @practice.memberships.create!(user: reader)
    login(reader)
    get "/api/clinic/payment_events/#{payment.id}/receipt", headers: @headers
    assert_response :forbidden

    other_practice = Clinic::Practice.create!(name: "Other Synthetic Receipt Practice", organization: @practice.organization)
    other_patient = other_practice.patients.create!(display_name: "Other Synthetic Receipt Patient", reference: "OTHER-SYN-RECEIPT")
    other_payment = Clinic::PaymentEvent.create!(practice: other_practice, patient: other_patient,
      external_event_reference: "other-receipt-payment", currency: "USD", amount: "10.00")
    login(@actor)
    get "/api/clinic/payment_events/#{other_payment.id}/receipt", headers: @headers
    assert_response :not_found
  end

  test "reconciliation replay requires the same normalized note and preserves attribution" do
    site = @practice.sites.create!(code: "RECEIPT")
    drawer = @practice.cash_drawer_sessions.create!(site: site, opened_by: @actor, currency: "USD", opening_float: "0.00")
    drawer.update!(status: "closed", counted_cash: "0.00", discrepancy: "0.00", closed_by: @actor, closed_at: Time.current)
    payload = { drawer: { reconciliation_note: "  Synthetic verified count  ", request_key: "synthetic-reconciliation" } }
    post "/api/clinic/cash_drawers/#{drawer.id}/reconcile", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    drawer.reload
    original = drawer.attributes.slice("reconciliation_note", "reconciled_by_id", "reconciled_at", "reconciliation_request_key")
    assert_equal "Synthetic verified count", original.fetch("reconciliation_note")

    post "/api/clinic/cash_drawers/#{drawer.id}/reconcile", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal original, drawer.reload.attributes.slice(*original.keys)

    post "/api/clinic/cash_drawers/#{drawer.id}/reconcile",
      params: { drawer: payload.fetch(:drawer).merge(reconciliation_note: "Different count") }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_match(/do not match/, response.parsed_body.fetch("error"))
    assert_equal original, drawer.reload.attributes.slice(*original.keys)

    post "/api/clinic/cash_drawers/#{drawer.id}/reconcile",
      params: { drawer: payload.fetch(:drawer).merge(request_key: "another-reconciliation") }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal original, drawer.reload.attributes.slice(*original.keys)
  end

  private

  def payment_receipt(kind)
    payment = Clinic::PaymentEvent.create!(practice: @practice, patient: @patient, currency: "USD", amount: "10.00",
      external_event_reference: "synthetic-receipt-#{kind}")
    receipt = Clinic::BillingReceipt.create!(practice: @practice, patient: @patient, invoice: @invoice,
      payment_event: payment, issued_by: @actor, kind: kind, issued_at: Time.current,
      payload: { "amount" => "10.00", "currency" => "USD" })
    [ payment, receipt ]
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
