require "test_helper"

class ClinicCashPayEstimateCorrectionsTest < ActionDispatch::IntegrationTest
  setup do
    @practice = Clinic::Practice.create!(name: "Estimate correction API", timezone: "UTC")
    @other_practice = Clinic::Practice.create!(name: "Other correction API", timezone: "UTC")
    @password = SecureRandom.hex(18)
    @actor = User.create!(email_address: "estimate-correction-api@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "billing.invoice_draft", "billing.read")
    @patient = @practice.patients.create!(display_name: "Correction patient", reference: "CORR-1")
    @service = @practice.billing_services.create!(name: "Visit", unit_amount: "75.00", currency: "USD")
    draft = Clinic::Billing::CreateCashPayEstimate.call(practice: @practice, actor: @actor, patient: @patient,
      classification: "gfe_candidate", currency: "USD", lines: [ { billing_service_id: @service.id, quantity: "1" } ], request_key: "api-original-create")
    @original = Clinic::Billing::IssueCashPayEstimate.call(estimate: draft, practice: @practice, actor: @actor,
      context: { payment_context: "uninsured", request_context: "Requested 2026-09-30", scheduled_context: "No service scheduled" },
      policy_version: "synthetic-policy-v1", delivery_method: "portal", request_key: "api-original-issue")
    host! "localhost:3000"
    post "/api/session", params: { email_address: @actor.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "date basis and context survive create issue and reload with conflicting retry denied" do
    payload = { estimate: { request_key: "context-api-create", patient_id: @patient.id, classification: "gfe_candidate", currency: "USD",
      payment_context: "self_pay", request_context: "Requested 2026-09-30", scheduled_context: "No service scheduled",
      lines: [ { billing_service_id: @service.id, quantity: "1", date_basis: "Expected visit 2026-10-02; not booked" } ] } }
    post "/api/clinic/cash_pay_estimates", params: payload, headers: csrf_headers, as: :json
    assert_response :created
    draft = response.parsed_body.fetch("estimate")
    assert_equal "self_pay", draft.fetch("payment_context")
    assert_equal "Requested 2026-09-30", draft.fetch("request_context")
    assert_equal "No service scheduled", draft.fetch("scheduled_context")
    assert_equal "Expected visit 2026-10-02; not booked", draft.fetch("lines").sole.fetch("date_basis")
    post "/api/clinic/cash_pay_estimates/#{draft.fetch('id')}/issue",
      params: { estimate: { request_key: "context-api-issue", policy_version: "synthetic-policy", delivery_method: "paper" } }, headers: csrf_headers, as: :json
    assert_response :success
    get "/api/clinic/cash_pay_estimates/#{draft.fetch('id')}"
    assert_response :success
    assert_equal draft.fetch("request_context"), response.parsed_body.fetch("estimate").fetch("request_context")
    post "/api/clinic/cash_pay_estimates", params: payload.deep_merge(estimate: { request_context: "Changed request" }), headers: csrf_headers, as: :json
    assert_response :conflict
  end

  test "unknown context is saved in drafts and blocks only new GFE issuance" do
    post "/api/clinic/cash_pay_estimates",
      params: { estimate: { request_key: "unknown-context-create", patient_id: @patient.id, classification: "gfe_candidate", currency: "USD",
        lines: [ { billing_service_id: @service.id, quantity: "1" } ] } }, headers: csrf_headers, as: :json
    assert_response :created
    draft = response.parsed_body.fetch("estimate")
    assert_equal "unknown", draft.fetch("payment_context")
    assert_nil draft.fetch("lines").sole.fetch("date_basis")
    post "/api/clinic/cash_pay_estimates/#{draft.fetch('id')}/issue",
      params: { estimate: { request_key: "unknown-context-issue", policy_version: "synthetic-policy", delivery_method: "paper" } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal "draft", Clinic::Billing::CashPayEstimate.find(draft.fetch("id")).status
    get "/api/clinic/cash_pay_estimates", params: { patient_id: @patient.id }
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
    assert_equal @service.reload.lock_version, estimate.fetch("lines").sole.fetch("source_price_revision")
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

  test "patient estimate history is readable, scoped, and includes both correction snapshots" do
    @service.update!(unit_amount: "95.00")
    post "/api/clinic/cash_pay_estimates/#{@original.id}/correct",
      params: { estimate: { request_key: "history-correction", reason: "Updated charge",
        lines: [ { billing_service_id: @service.id, quantity: "1" } ] } },
      headers: csrf_headers, as: :json
    assert_response :created
    correction_id = response.parsed_body.fetch("estimate").fetch("id")

    get "/api/clinic/cash_pay_estimates", params: { patient_id: @patient.id }
    assert_response :success
    history = response.parsed_body.fetch("estimates")
    assert_equal [ correction_id, @original.id ], history.map { |item| item.fetch("id") }
    assert_equal [ "95.0", "75.0" ], history.map { |item| item.fetch("lines").sole.fetch("unit_amount") }
    assert_equal [ 1, 0 ], history.map { |item| item.fetch("lines").sole.fetch("source_price_revision") }
    assert_equal @original.id, history.first.fetch("supersedes_id")
    assert_equal false, response.parsed_body.fetch("truncated")

    get "/api/clinic/cash_pay_estimates/#{@original.id}"
    assert_response :success
    assert_equal "75.0", response.parsed_body.fetch("estimate").fetch("lines").sole.fetch("unit_amount")
    assert_equal 0, response.parsed_body.fetch("estimate").fetch("lines").sole.fetch("source_price_revision")

    foreign_patient = @other_practice.patients.create!(display_name: "Other patient", reference: "OTHER-CORR")
    get "/api/clinic/cash_pay_estimates", params: { patient_id: foreign_patient.id }
    assert_response :not_found
    foreign_estimate = Clinic::Billing::CashPayEstimate.create!(practice: @other_practice, patient: foreign_patient,
      classification: "gfe_candidate", status: "draft", currency: "USD")
    get "/api/clinic/cash_pay_estimates/#{foreign_estimate.id}"
    assert_response :not_found
  end

  test "estimate history permits billing readers but keeps correction write denied" do
    reader_password = SecureRandom.hex(18)
    reader = User.create!(email_address: "estimate-history-reader@example.invalid", password: reader_password)
    reader_membership = @practice.memberships.create!(user: reader)
    grant_permissions!(reader_membership, "billing.read")
    post "/api/session", params: { email_address: reader.email_address, password: reader_password }, headers: csrf_headers, as: :json
    assert_response :success

    get "/api/clinic/cash_pay_estimates", params: { patient_id: @patient.id }
    assert_response :success
    assert_equal [ @original.id ], response.parsed_body.fetch("estimates").map { |item| item.fetch("id") }
    post "/api/clinic/cash_pay_estimates/#{@original.id}/correct",
      params: { estimate: { request_key: "reader-denied-correction", reason: "No write access",
        lines: [ { billing_service_id: @service.id, quantity: "1" } ] } },
      headers: csrf_headers, as: :json
    assert_response :forbidden
  end

  test "written delivery is a separate attributed and replayable step" do
    path = "/api/clinic/cash_pay_estimates/#{@original.id}/deliver"
    payload = { estimate: { request_key: "api-delivery" } }
    assert_nil @original.delivered_at

    post path, params: payload, headers: csrf_headers, as: :json
    assert_response :success
    delivered_at = response.parsed_body.dig("estimate", "delivered_at")
    assert delivered_at.present?
    assert_equal "portal", response.parsed_body.dig("estimate", "delivery_method")
    assert_equal 1, @practice.audit_events.where(action_code: "cash_pay_estimate.delivery.record").count

    post path, params: payload, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal delivered_at, response.parsed_body.dig("estimate", "delivered_at")
    post path, params: { estimate: { request_key: "second-delivery" } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity

    get "/api/clinic/cash_pay_estimates/#{@original.id}"
    assert_response :success
    assert_equal delivered_at, response.parsed_body.dig("estimate", "delivered_at")
  end

  private

  def csrf_headers
    get "/api/csrf", headers: { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1", "X-CSRF-Token" => response.parsed_body.fetch("csrf_token") }
  end
end
