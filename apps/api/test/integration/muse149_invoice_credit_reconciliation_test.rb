require "test_helper"
require "json"

# Current-local proof for original key:
# 149 | Invoice #3 (SIMT) shows Settled with allocated USD 25.00 ≠ total USD 30.00 and no visible credit
# New independently synthetic records; this does not identify the historical invoice.
class Muse149InvoiceCreditReconciliationTest < ActionDispatch::IntegrationTest
  test "muse149 persists and projects thirty dollars as twenty five allocated plus five credit" do
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.149" }
    password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic MUSE149 organization")
    practice = Clinic::Practice.create!(name: "Synthetic MUSE149 practice", organization: organization)
    actor = User.create!(email_address: "muse149-#{SecureRandom.hex(8)}@example.invalid", password: password)
    membership = practice.memberships.create!(user: actor)
    grant_permissions!(membership, "billing.read", "billing.invoice_draft", "billing.invoice_post", "billing.payment_record")
    patient = practice.patients.create!(display_name: "Synthetic MUSE149 patient", reference: "MUSE149-SYNTHETIC")
    site = practice.sites.create!(code: "MUSE149")
    drawer = practice.cash_drawer_sessions.create!(site: site, opened_by: actor, currency: "USD", opening_float: "20.00")
    invoice = Clinic::Billing::DraftInvoice.call(
      practice: practice, actor: actor, patient: patient, currency: "USD",
      lines: [ { quantity: "1", unit_amount: "30.00", description_snapshot: "Synthetic MUSE149 service" } ],
      request_key: "muse149-draft"
    )
    Clinic::Billing::PostInvoice.call(invoice: invoice, actor: actor, request_key: "muse149-post")
    post "/api/session", params: { email_address: actor.email_address, password: password }, headers: csrf_headers, as: :json
    assert_response :success

    post "/api/clinic/invoices/#{invoice.id}/cash_payments",
      params: { cash_payment: { cash_drawer_session_id: drawer.id, tendered_amount: "25.00",
        allocation_amount: "25.00", request_key: "muse149-cash" } }, headers: csrf_headers, as: :json
    assert_response :created
    acknowledgment = response.parsed_body
    allocation = invoice.payment_allocations.reload.sole
    payment = allocation.payment_event
    tender = payment.cash_tender
    receipt = payment.billing_receipts.where(kind: "cash_payment").sole
    assert_equal allocation.id, acknowledgment.dig("payment_allocation", "id")
    assert_equal payment.id, acknowledgment.dig("payment_allocation", "payment_event_id")
    assert_equal tender.id, acknowledgment.dig("cash_tender", "id")
    assert_equal drawer.id, tender.cash_drawer_session_id
    assert_equal BigDecimal("25"), allocation.amount
    assert_equal BigDecimal("25"), payment.amount
    assert_equal BigDecimal("25"), tender.tendered_amount
    assert_equal BigDecimal("0"), tender.change_amount
    assert_equal allocation.id, receipt.payload.fetch("allocation_id")
    assert_equal invoice.id, receipt.invoice_id
    assert_equal patient.id, receipt.patient_id
    assert_equal "45.0", Clinic::Billing::CashDrawer.call(drawer.reload).fetch(:expected_cash)

    get "/api/clinic/patients/#{patient.id}/billing_ledger", headers: @headers
    assert_response :success
    before_credit = response.parsed_body.fetch("invoices").find { |row| row.fetch("id") == invoice.id }
    assert_amounts(before_credit, credit: "0.0", balance: "5.0")

    post "/api/clinic/invoices/#{invoice.id}/credits",
      params: { credit: { amount: "5.00", reason: "Synthetic MUSE149 reconciliation", request_key: "muse149-credit" } },
      headers: csrf_headers, as: :json
    assert_response :created
    credit = invoice.credit_notes.reload.sole
    assert_equal BigDecimal("5"), credit.amount
    assert_equal "credit", credit.adjustment_type
    assert_equal "Synthetic MUSE149 reconciliation", credit.reason
    assert_equal "posted", invoice.reload.status
    assert_equal BigDecimal("30"), invoice.lines.sum(:posted_amount)
    assert_equal BigDecimal("25"), invoice.payment_allocations.sum(:amount)
    assert_equal BigDecimal("5"), invoice.credit_notes.sum(:amount)
    assert_equal 0, Clinic::RefundEvent.where(practice: practice, patient: patient).count

    get "/api/clinic/patients/#{patient.id}/billing_ledger", headers: @headers
    assert_response :success
    ledger = response.parsed_body
    projected = ledger.fetch("invoices").find { |row| row.fetch("id") == invoice.id }
    assert_amounts(projected, credit: "5.0", balance: "0.0")
    projected_credit = projected.fetch("credits").sole
    assert_equal credit.id, projected_credit.fetch("id")
    assert_equal "5.0", projected_credit.fetch("amount")
    assert_equal "credit", projected_credit.fetch("adjustment_type")
    assert_equal credit.reason, projected_credit.fetch("reason")
    assert_equal allocation.id, projected.fetch("allocations").sole.fetch("id")
    summary = ledger.fetch("currencies").sole
    assert_equal "USD", summary.fetch("currency")
    assert_equal "30.0", summary.fetch("invoiced_amount")
    assert_equal "25.0", summary.fetch("allocated_amount")
    assert_equal "5.0", summary.fetch("credited_amount")
    assert_equal "0.0", summary.fetch("balance_amount")

    get "/api/clinic/invoices/#{invoice.id}", headers: @headers
    assert_response :success
    detail = response.parsed_body.fetch("invoice")
    assert_amounts(detail, credit: "5.0", balance: "0.0")
    assert_equal credit.id, detail.fetch("credits").sole.fetch("id")
    assert_equal credit.reason, detail.fetch("credits").sole.fetch("reason")
    assert_equal patient.id, detail.fetch("patient_id")

    activity = Clinic::Care::PatientActivityHistory.call(patient: patient,
      ability: Ability.new(actor, practice: practice))
    activity_credit = activity.fetch(:entries).find { |row| row[:source] == "credits" && row[:record_id] == credit.id }
    assert activity_credit
    assert_equal "Credits", activity_credit.fetch(:section)
    assert_equal "Clinic::CreditNote", activity_credit.fetch(:record_type)
    assert_equal "recorded", activity_credit.fetch(:event)
    assert_equal "membership:#{membership.id}", activity_credit.fetch(:actor_reference)
    assert_equal credit.issued_at.iso8601(6), activity_credit.fetch(:occurred_at)
    assert_empty activity_credit.fetch(:changed_fields)
    refute_includes activity.to_json, credit.reason

    get "/api/clinic/payment_events/#{payment.id}/receipt", headers: @headers
    assert_response :success
    assert_includes response.body, "USD 25.00"

    # Optional handoff to the rendering test: only asserted, independently synthetic HTTP payloads.
    # Use a fresh file name for every run; never overwrite an existing proof.
    if (output = ENV["MUSE149_LEDGER_PROOF_OUTPUT"]).present?
      envelope = {
        schema: "muse149-persisted-proof-v1",
        source_base: "59a0e302035f5b8a107c34a8db4e007f23dc3bab",
        claim_key: "149 | Invoice #3 (SIMT) shows Settled with allocated USD 25.00 ≠ total USD 30.00 and no visible credit",
        practice_id: practice.id, actor_id: actor.id, membership_id: membership.id,
        ledger: ledger, invoice: detail, activity: activity
      }
      File.open(output, "wx") { |file| file.write(JSON.pretty_generate(envelope)) }
    end
  end

  private

  def assert_amounts(payload, credit:, balance:)
    assert_equal "posted", payload.fetch("status")
    assert_equal "USD", payload.fetch("currency")
    assert_equal "30.0", payload.fetch("total_amount")
    assert_equal "25.0", payload.fetch("allocated_amount")
    assert_equal credit, payload.fetch("credit_amount")
    assert_equal balance, payload.fetch("balance_amount")
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
