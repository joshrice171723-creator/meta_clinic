require "test_helper"

class CashPayEstimateContextTest < ActiveSupport::TestCase
  setup do
    @practice = Clinic::Practice.create!(name: "Synthetic estimate context", timezone: "UTC")
    @actor = User.create!(email_address: "estimate-context@example.invalid", password: SecureRandom.hex(20))
    grant_permissions!(@practice.memberships.create!(user: @actor), "billing.invoice_draft")
    @patient = @practice.patients.create!(display_name: "Synthetic context patient", reference: "CTX-1")
    @service = @practice.billing_services.create!(name: "Synthetic visit", currency: "USD", unit_amount: "75.00")
    @context = { payment_context: "self_pay", request_context: "Requested 2026-09-30", scheduled_context: "No service scheduled" }
    @lines = [ { billing_service_id: @service.id, quantity: "1", date_basis: "Expected visit 2026-10-02; not booked" } ]
  end

  test "draft preserves unknown context and date basis without granting issuance" do
    draft = create(lines: [ { billing_service_id: @service.id, quantity: "1" } ])
    assert_equal "unknown", draft.payment_context
    assert_nil draft.request_context
    assert_nil draft.scheduled_context
    assert_nil draft.lines.sole.date_basis
    legacy_payload = { patient_id: @patient.id, classification: "gfe_candidate", currency: "USD",
      lines: Clinic::Billing::CreateCashPayEstimate.normalize_request_lines([ { billing_service_id: @service.id, quantity: "1" } ]) }
    receipt = Clinic::OperationReceipt.find_by!(practice: @practice, operation_code: "cash_pay_estimate.create", request_key: "context-create")
    assert_equal Clinic::Idempotency.payload_digest(legacy_payload), receipt.payload_digest
    assert_raises(ArgumentError) { issue(draft) }
    assert_equal "draft", draft.reload.status
    assert_nil draft.issued_at
  end

  test "issue requires each recorded context while other context makes no eligibility decision" do
    draft = create
    [ @context.merge(payment_context: "unknown"), @context.merge(request_context: " "), @context.merge(scheduled_context: nil) ].each do |context|
      assert_raises(ArgumentError) { issue(draft, context: context) }
      assert_equal "draft", draft.reload.status
    end
    issued = issue(draft, context: @context.merge(payment_context: "other"))
    assert_equal "other", issued.payment_context
    assert_equal @context[:request_context], issued.request_context
    assert_equal @context[:scheduled_context], issued.scheduled_context
    assert_equal @lines.sole[:date_basis], issued.lines.sole.date_basis
  end

  test "snapshot retry correction and history preserve exact recorded facts" do
    draft = create(context: @context)
    replay = create(context: @context)
    assert_equal draft.id, replay.id
    assert_raises(Clinic::Idempotency::Conflict) { create(context: @context.merge(request_context: "Different request")) }
    assert_raises(Clinic::Idempotency::Conflict) { create(context: @context, lines: @lines.map { |line| line.merge(date_basis: "Changed basis") }) }
    issued = issue(draft)
    assert_equal issued.id, issue(issued).id
    assert_not issued.update(request_context: "Changed after issue")
    assert_not issued.lines.sole.update(date_basis: "Changed after issue")
    issued.reload
    correction = Clinic::Billing::CorrectCashPayEstimate.call(predecessor: issued, practice: @practice, actor: @actor,
      reason: "Recorded schedule changed", lines: @lines.map { |line| line.merge(date_basis: "Expected visit 2026-10-03; not booked") },
      context: { scheduled_context: "No service scheduled; revised expected date" }, request_key: "context-correct")
    assert_equal @context[:request_context], correction.request_context
    assert_equal "self_pay", correction.payment_context
    issue(correction, request_key: "context-correction-issue")
    assert_equal "superseded", issued.reload.status
    assert_equal @context[:scheduled_context], issued.scheduled_context
    assert_equal @lines.sole[:date_basis], issued.lines.sole.date_basis
    assert_equal "Expected visit 2026-10-03; not booked", correction.reload.lines.sole.date_basis
  end

  test "unknown legacy issued context stays immutable and delivery history remains usable" do
    historical = create
    historical.update!(status: "issued", classification: "issued_gfe", issued_at: Time.current,
      policy_version: "historical-synthetic-policy", delivery_method: "paper")
    assert_nil historical.request_context
    assert_equal "unknown", historical.payment_context
    assert_not historical.update(payment_context: "uninsured")
    historical.reload.update!(delivered_at: Time.current)
    assert historical.reload.delivered_at
  end

  test "invalid and oversized facts are rejected while omitted legacy payload shape stays unchanged" do
    assert_raises(ArgumentError) { create(context: @context.merge(payment_context: "eligible_gfe")) }
    assert_raises(ArgumentError) { create(context: @context.merge(request_context: "x" * 501)) }
    assert_raises(ArgumentError) { create(lines: @lines.map { |line| line.merge(date_basis: { date: "2026-10-02" }) }) }
    assert_raises(ArgumentError) { create(lines: @lines.map { |line| line.merge(date_basis: "x" * 501) }) }
    legacy = Clinic::Billing::CreateCashPayEstimate.normalize_request_lines([ { billing_service_id: @service.id, quantity: "1" } ])
    refute legacy.sole.key?(:date_basis)
    assert_equal({}, Clinic::Billing::CreateCashPayEstimate.normalize_context({}))
  end

  private

  def create(context: {}, lines: @lines)
    Clinic::Billing::CreateCashPayEstimate.call(practice: @practice, actor: @actor, patient: @patient,
      classification: "gfe_candidate", currency: "USD", context: context, lines: lines, request_key: "context-create")
  end

  def issue(estimate, context: {}, request_key: "context-issue")
    Clinic::Billing::IssueCashPayEstimate.call(estimate: estimate, practice: @practice, actor: @actor,
      policy_version: "synthetic-reviewed-policy", delivery_method: "paper", context: context, request_key: request_key)
  end
end
