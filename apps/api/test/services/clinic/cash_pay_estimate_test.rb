require "test_helper"

class CashPayEstimateTest < ActiveSupport::TestCase
  setup do
    @actor = User.create!(email_address: "estimate@example.invalid", password: SecureRandom.hex(20))
    @practice = Clinic::Practice.create!(name: "Estimate practice", timezone: "UTC")
    membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(membership, "billing.invoice_draft")
    @patient = @practice.patients.create!(display_name: "Estimate patient", reference: "EST-1")
    @service = @practice.billing_services.create!(name: "Visit", unit_amount: "75.00", currency: "USD")
  end

  test "GFE candidates snapshot a catalog price and require a policy version before issue" do
    estimate = Clinic::Billing::CreateCashPayEstimate.call(practice: @practice, actor: @actor, patient: @patient,
      classification: "gfe_candidate", currency: "USD", request_key: "estimate-create",
      lines: [ { billing_service_id: @service.id, quantity: "2", inclusions: "Visit" } ])
    assert_equal "draft", estimate.status
    assert_equal "150.0", estimate.lines.sole.expected_amount.to_s("F")
    @service.update!(unit_amount: "90.00")
    assert_equal "75.0", estimate.reload.lines.sole.unit_amount.to_s("F")
    assert_raises(ArgumentError) { Clinic::Billing::IssueCashPayEstimate.call(estimate: estimate, practice: @practice, actor: @actor, policy_version: "", delivery_method: "portal", request_key: "estimate-issue-empty") }
    issued = Clinic::Billing::IssueCashPayEstimate.call(estimate: estimate, practice: @practice, actor: @actor, policy_version: "synthetic-policy-v1", delivery_method: "portal", request_key: "estimate-issue")
    assert_equal "issued_gfe", issued.classification
    assert_equal "issued", issued.status
  end

  test "correction snapshots current price and supersedes only when explicitly issued" do
    original = issued_estimate
    original_issued_at = original.issued_at
    original_policy = original.policy_version
    @service.update!(unit_amount: "95.00")

    correction = correct(original, request_key: "correction-1")
    assert_equal "draft", correction.status
    assert_equal "gfe_candidate", correction.classification
    assert_equal original.id, correction.supersedes_id
    assert_equal 2, correction.revision
    assert_equal "Catalog price changed", correction.correction_reason
    assert_equal "95.0", correction.lines.sole.unit_amount.to_s("F")
    assert_equal "75.0", original.reload.lines.sole.unit_amount.to_s("F")
    assert_equal "issued", original.status
    assert_raises(ActiveRecord::RecordInvalid) { original.update!(policy_version: "changed") }

    issued = Clinic::Billing::IssueCashPayEstimate.call(estimate: correction, practice: @practice, actor: @actor,
      policy_version: "synthetic-policy-v2", delivery_method: "portal", request_key: "correction-issue")
    assert_equal "issued", issued.status
    assert_equal "superseded", original.reload.status
    assert_equal original_issued_at, original.issued_at
    assert_equal original_policy, original.policy_version
    assert_equal "75.0", original.lines.sole.unit_amount.to_s("F")
    assert_equal issued.id, Clinic::Billing::IssueCashPayEstimate.call(estimate: issued, practice: @practice, actor: @actor,
      policy_version: "synthetic-policy-v2", delivery_method: "portal", request_key: "correction-issue").id
    assert_not original.lines.sole.update(unit_amount: "1.00")
  end

  test "correction replay returns its first snapshot after price changes" do
    original = issued_estimate
    first = correct(original, request_key: "correction-replay")
    @service.update!(unit_amount: "120.00")
    replay = correct(original, request_key: "correction-replay")
    assert_equal first.id, replay.id
    assert_equal "75.0", replay.lines.sole.unit_amount.to_s("F")
    assert_raises(Clinic::Idempotency::Conflict) do
      Clinic::Billing::CorrectCashPayEstimate.call(predecessor: original, practice: @practice, actor: @actor,
        reason: "Another reason", lines: correction_lines, request_key: "correction-replay")
    end
  end

  test "correction rejects wrong practice unauthorized actor and invalid predecessor" do
    original = issued_estimate
    other = Clinic::Practice.create!(name: "Other estimate practice", timezone: "UTC")
    grant_permissions!(other.memberships.create!(user: @actor), "billing.invoice_draft")
    assert_raises(Clinic::Authorization::Denied) { correct(original, actor: User.create!(email_address: "no-estimate@example.invalid", password: SecureRandom.hex(20)), request_key: "unauthorized") }
    assert_raises(ActiveRecord::RecordNotFound) { correct(original, practice: other, request_key: "wrong-practice") }

    correction = correct(original, request_key: "first-correction")
    assert_raises(ArgumentError) { correct(original, request_key: "second-correction") }
    assert_raises(ArgumentError) { correct(correction, request_key: "draft-predecessor") }
    assert_raises(ArgumentError) do
      Clinic::Billing::CorrectCashPayEstimate.call(predecessor: original, practice: @practice, actor: @actor,
        reason: " ", lines: correction_lines, request_key: "blank-reason")
    end
  end

  private

  def correction_lines
    [ { billing_service_id: @service.id, quantity: "1", inclusions: "Visit" } ]
  end

  def issued_estimate
    estimate = Clinic::Billing::CreateCashPayEstimate.call(practice: @practice, actor: @actor, patient: @patient,
      classification: "gfe_candidate", currency: "USD", request_key: "original-create", lines: correction_lines)
    Clinic::Billing::IssueCashPayEstimate.call(estimate: estimate, practice: @practice, actor: @actor,
      policy_version: "synthetic-policy-v1", delivery_method: "portal", request_key: "original-issue")
  end

  def correct(predecessor, practice: @practice, actor: @actor, request_key:)
    Clinic::Billing::CorrectCashPayEstimate.call(predecessor: predecessor, practice: practice, actor: actor,
      reason: "Catalog price changed", lines: correction_lines, request_key: request_key)
  end
end
