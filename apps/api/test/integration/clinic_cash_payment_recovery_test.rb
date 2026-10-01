require "test_helper"

class ClinicCashPaymentRecoveryTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic cash recovery organization")
    @practice = Clinic::Practice.create!(name: "Synthetic cash recovery practice", organization: organization)
    @actor = User.create!(email_address: "cash-recovery@example.invalid", password: password)
    membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(membership, "billing.read", "billing.invoice_draft", "billing.invoice_post", "billing.payment_record")
    @patient = @practice.patients.create!(display_name: "Synthetic cash recovery patient", reference: "SYN-CASH-RECOVERY")
    site = @practice.sites.create!(code: "SYN-CASH")
    @drawer = @practice.cash_drawer_sessions.create!(site: site, opened_by: @actor, currency: "USD", opening_float: "20.00")
    @invoice = Clinic::Billing::DraftInvoice.call(
      practice: @practice, actor: @actor, patient: @patient, currency: "USD",
      lines: [ { quantity: "1", unit_amount: "25.00", description_snapshot: "Synthetic cash recovery service" } ]
    )
    Clinic::Billing::PostInvoice.call(invoice: @invoice, actor: @actor)
    @payment = { cash_payment: { cash_drawer_session_id: @drawer.id, tendered_amount: "30.00",
      allocation_amount: "25.00", request_key: "SYN-CASH-RECOVERY-001" } }
    post "/api/session", params: { email_address: @actor.email_address, password: password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "cash response identifies a persisted allocation tender and matching receipt" do
    before = record_counts
    submit_cash
    assert_response :created
    acknowledgment = response.parsed_body
    assert_equal before.map { |count| count + 1 }, record_counts
    assert_persisted_acknowledgment(acknowledgment)

    submit_cash
    assert_response :created
    assert_equal acknowledgment, response.parsed_body
    assert_equal before.map { |count| count + 1 }, record_counts
  end

  test "retry after an exception following commit returns the original payment without duplicates" do
    before = record_counts
    original = Clinic::Realtime::Publisher.method(:publish)
    Clinic::Realtime::Publisher.singleton_class.define_method(:publish) do |**arguments|
      raise RuntimeError, "Synthetic acknowledgment lost after commit"
    end
    begin
      # Test middleware re-raises unexpected errors; deployed middleware turns
      # this post-commit exception into the ambiguous server-error response.
      error = assert_raises(RuntimeError) { submit_cash }
      assert_equal "Synthetic acknowledgment lost after commit", error.message
    ensure
      Clinic::Realtime::Publisher.singleton_class.define_method(:publish, original)
    end
    assert_equal before.map { |count| count + 1 }, record_counts
    committed = Clinic::PaymentAllocation.find_by!(practice: @practice, invoice: @invoice)

    submit_cash
    assert_response :created
    assert_equal committed.id, response.parsed_body.dig("payment_allocation", "id")
    assert_equal committed.payment_event_id, response.parsed_body.dig("payment_allocation", "payment_event_id")
    assert_equal before.map { |count| count + 1 }, record_counts
    assert_persisted_acknowledgment(response.parsed_body)
  end

  test "receipt failure rolls back cash records and the same request can then succeed" do
    before = record_counts
    original = Clinic::BillingReceipt.method(:create!)
    Clinic::BillingReceipt.singleton_class.define_method(:create!) do |*|
      raise RuntimeError, "Synthetic receipt persistence failure"
    end
    begin
      error = assert_raises(RuntimeError) { submit_cash }
      assert_equal "Synthetic receipt persistence failure", error.message
    ensure
      Clinic::BillingReceipt.singleton_class.define_method(:create!, original)
    end
    assert_equal before, record_counts
    assert_equal "20.0", Clinic::Billing::CashDrawer.call(@drawer.reload).fetch(:expected_cash)

    submit_cash
    assert_response :created
    assert_equal before.map { |count| count + 1 }, record_counts
    assert_persisted_acknowledgment(response.parsed_body)
  end

  private

  def submit_cash
    post "/api/clinic/invoices/#{@invoice.id}/cash_payments", params: @payment, headers: csrf_headers, as: :json
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def record_counts
    [ Clinic::PaymentEvent, Clinic::PaymentAllocation, Clinic::CashTender, Clinic::BillingReceipt ].map do |model|
      model.where(practice: @practice).count
    end
  end

  def assert_persisted_acknowledgment(acknowledgment)
    allocation = Clinic::PaymentAllocation.find(acknowledgment.dig("payment_allocation", "id"))
    payment = allocation.payment_event
    tender = Clinic::CashTender.find(acknowledgment.dig("cash_tender", "id"))
    receipt = Clinic::BillingReceipt.where(practice: @practice, payment_event: payment, kind: "cash_payment").sole
    assert_equal @invoice.id, allocation.invoice_id
    assert_equal @patient.id, payment.patient_id
    assert_equal payment.id, acknowledgment.dig("payment_allocation", "payment_event_id")
    assert_equal payment.id, tender.payment_event_id
    assert_equal @drawer.id, tender.cash_drawer_session_id
    assert_equal @drawer.id, acknowledgment.dig("cash_tender", "cash_drawer_session_id")
    assert_equal "SYN-CASH-RECOVERY-001", tender.request_key
    assert_equal BigDecimal("25.00"), allocation.amount
    assert_equal "25.0", acknowledgment.dig("payment_allocation", "amount")
    assert_equal "30.0", acknowledgment.dig("cash_tender", "tendered_amount")
    assert_equal "5.0", acknowledgment.dig("cash_tender", "change_amount")
    assert_equal @invoice.id, receipt.invoice_id
    assert_equal @patient.id, receipt.patient_id
    assert_equal allocation.id, receipt.payload.fetch("allocation_id")
    assert_equal "25.0", receipt.payload.fetch("amount")
    assert_equal "5.0", receipt.payload.fetch("change_amount")
    assert_equal "USD", receipt.payload.fetch("currency")
    assert_equal payment.created_at, allocation.created_at
    assert_equal payment.created_at, receipt.issued_at
    assert_equal "45.0", Clinic::Billing::CashDrawer.call(@drawer.reload).fetch(:expected_cash)
  end
end
