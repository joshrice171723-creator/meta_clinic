require "test_helper"

class ClinicCashPayEstimateCorrectionsTest < ActionDispatch::IntegrationTest
  setup do
    @practice = Clinic::Practice.create!(name: "Estimate correction API", timezone: "UTC")
    @other_practice = Clinic::Practice.create!(name: "Other correction API", timezone: "UTC")
    @password = SecureRandom.hex(18)
    @actor = User.create!(email_address: "estimate-correction-api@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "billing.invoice_draft")
    @patient = @practice.patients.create!(display_name: "Correction patient", reference: "CORR-1")
    @service = @practice.billing_services.create!(name: "Visit", unit_amount: "75.00", currency: "USD")
    draft = Clinic::Billing::CreateCashPayEstimate.call(practice: @practice, actor: @actor, patient: @patient,
      classification: "gfe_candidate", currency: "USD", lines: [ { billing_service_id: @service.id, quantity: "1" } ], request_key: "api-original-create")
    @original = Clinic::Billing::IssueCashPayEstimate.call(estimate: draft, practice: @practice, actor: @actor,
      policy_version: "synthetic-policy-v1", delivery_method: "portal", request_key: "api-original-issue")
    host! "localhost:3000"
    post "/api/session", params: { email_address: @actor.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "correction route returns linked snapshot and rejects foreign estimate" do
    @service.update!(unit_amount: "95.00")
    payload = { estimate: { request_key: "api-correction", reason: "Catalog price changed",
      lines: [ { billing_service_id: @service.id, quantity: "1" } ] } }
    post "/api/clinic/cash_pay_estimates/#{@original.id}/correct", params: payload, headers: csrf_headers, as: :json
    assert_response :created
    estimate = response.parsed_body.fetch("estimate")
    assert_equal @original.id, estimate.fetch("supersedes_id")
    assert_equal "Catalog price changed", estimate.fetch("correction_reason")
    assert_equal "95.0", estimate.fetch("lines").sole.fetch("unit_amount")
    assert_equal "issued", @original.reload.status

    foreign = Clinic::Billing::CashPayEstimate.create!(practice: @other_practice, classification: "issued_gfe", status: "issued", currency: "USD",
      policy_version: "synthetic-policy-v1", issued_at: Time.current)
    post "/api/clinic/cash_pay_estimates/#{foreign.id}/correct", params: payload.merge(estimate: payload[:estimate].merge(request_key: "foreign-correction")), headers: csrf_headers, as: :json
    assert_response :not_found
  end

  test "correction route requires billing authority" do
    password = SecureRandom.hex(18)
    reader = User.create!(email_address: "estimate-correction-reader@example.invalid", password: password)
    @practice.memberships.create!(user: reader)
    post "/api/session", params: { email_address: reader.email_address, password: password }, headers: csrf_headers, as: :json
    assert_response :success
    post "/api/clinic/cash_pay_estimates/#{@original.id}/correct",
      params: { estimate: { request_key: "denied-correction", reason: "Changed price", lines: [ { billing_service_id: @service.id, quantity: "1" } ] } },
      headers: csrf_headers, as: :json
    assert_response :forbidden
  end

  private

  def csrf_headers
    get "/api/csrf", headers: { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1", "X-CSRF-Token" => response.parsed_body.fetch("csrf_token") }
  end
end
