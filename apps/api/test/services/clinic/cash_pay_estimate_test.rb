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

  test "new estimate links a published offering and correction preserves its retired link" do
    offering = published_offering
    lines = [ { billing_service_id: @service.id, service_offering_id: offering.id, quantity: "1" } ]
    estimate = Clinic::Billing::CreateCashPayEstimate.call(practice: @practice, actor: @actor, patient: @patient,
      classification: "gfe_candidate", currency: "USD", request_key: "linked-offering", lines: lines)
    assert_equal offering.id, estimate.lines.sole.service_offering_id

    replay = Clinic::Billing::CreateCashPayEstimate.call(practice: @practice, actor: @actor, patient: @patient,
      classification: "gfe_candidate", currency: "USD", request_key: "linked-offering", lines: lines)
    assert_equal estimate.id, replay.id
    offering.update!(status: "retired", retired_at: Time.current)
    assert_raises(ArgumentError) do
      Clinic::Billing::CreateCashPayEstimate.call(practice: @practice, actor: @actor, patient: @patient,
        classification: "gfe_candidate", currency: "USD", request_key: "retired-offering", lines: lines)
    end

    issued = Clinic::Billing::IssueCashPayEstimate.call(estimate: estimate, practice: @practice, actor: @actor,
      policy_version: "synthetic-policy-v1", delivery_method: "portal", request_key: "linked-offering-issue")
    correction = Clinic::Billing::CorrectCashPayEstimate.call(predecessor: issued, practice: @practice, actor: @actor,
      reason: "Revised estimate", lines: lines, request_key: "linked-offering-correct")
    assert_equal offering.id, correction.lines.sole.service_offering_id
  end

  test "offering link rejects drafts mismatched prices and another practice" do
    draft = @practice.service_offerings.create!(name: "Unpublished", billing_service: @service)
    other_service = @practice.billing_services.create!(name: "Other price", unit_amount: "55.00", currency: "USD")
    published = published_offering
    other_practice = Clinic::Practice.create!(name: "Foreign estimate practice", timezone: "UTC")
    foreign = other_practice.service_offerings.create!(name: "Foreign")

    [ [ draft.id, @service.id ], [ published.id, other_service.id ], [ foreign.id, @service.id ] ].each_with_index do |(offering_id, service_id), index|
      assert_raises(index == 2 ? ActiveRecord::RecordNotFound : ArgumentError) do
        Clinic::Billing::CreateCashPayEstimate.call(practice: @practice, actor: @actor, patient: @patient,
          classification: "gfe_candidate", currency: "USD", request_key: "bad-offering-#{index}",
          lines: [ { billing_service_id: service_id, service_offering_id: offering_id, quantity: "1" } ])
      end
    end
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

  def published_offering
    site = @practice.sites.create!(code: "ESTIMATE", name: "Estimate site", status: "draft")
    visit_type = @practice.visit_types.create!(code: "Estimate visit")
    offering = @practice.service_offerings.create!(name: "Visit offering", billing_service: @service,
      visit_type: visit_type, duration_minutes: 30, modality: "either", status: "draft")
    offering.offering_sites.create!(practice: @practice, site: site)
    offering.update!(status: "published", published_at: Time.current)
    offering
  end

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
