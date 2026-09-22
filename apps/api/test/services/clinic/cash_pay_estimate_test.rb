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
end
