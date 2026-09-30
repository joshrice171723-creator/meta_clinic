require "test_helper"

class EstimateInvoiceComparisonTest < ActionDispatch::IntegrationTest
  setup do
    @practice = Clinic::Practice.create!(name: "Synthetic comparison clinic", timezone: "UTC")
    @other_practice = Clinic::Practice.create!(name: "Foreign comparison clinic", timezone: "UTC")
    @password = SecureRandom.hex(18)
    @actor = User.create!(email_address: "comparison-reader@example.invalid", password: @password)
    grant_permissions!(@practice.memberships.create!(user: @actor), "billing.read")
    @patient = @practice.patients.create!(display_name: "Synthetic comparison patient", reference: "COMPARE-A")
    @other_patient = @practice.patients.create!(display_name: "Other comparison patient", reference: "COMPARE-B")
    @service = @practice.billing_services.create!(name: "Snapshot service", unit_amount: "75.10", currency: "USD")
    @estimate = build_estimate(@practice, @patient)
    @invoice = build_invoice(@practice, @patient, amount: "95.30")
    host! "localhost:3000"
    sign_in(@actor)
  end

  test "read-only billing staff compare exact immutable snapshots after the catalog changes" do
    @service.update!(unit_amount: "999.99")
    before = financial_snapshot
    get comparison_path, params: { patient_id: @patient.id, invoice_id: @invoice.id }
    assert_response :success
    assert_equal "no-store", response.headers["Cache-Control"]
    comparison = response.parsed_body.fetch("comparison")
    assert_equal "estimate-invoice-comparison-v1", comparison.fetch("schema_version")
    assert_equal @patient.id, comparison.fetch("patient_id")
    assert_equal "posted_charges_before_payments_and_credits", comparison.fetch("comparison_basis")
    assert_equal "USD", comparison.fetch("currency")
    assert_equal "75.3", comparison.dig("estimate", "total_amount")
    assert_equal "95.3", comparison.dig("invoice", "total_amount")
    assert_equal "20.0", comparison.fetch("difference_amount")
    assert_equal @estimate.id, comparison.dig("estimate", "id")
    assert_equal @invoice.id, comparison.dig("invoice", "id")
    assert_equal "75.1", comparison.dig("estimate", "lines", 0, "unit_amount")
    assert_equal "Synthetic additional fee", comparison.dig("estimate", "lines", 1, "description")
    assert_equal "No laboratory charges", comparison.dig("estimate", "lines", 0, "exclusions")
    get comparison_path, params: { patient_id: @patient.id, invoice_id: @invoice.id }
    assert_response :success
    assert_equal comparison.except("generated_at"), response.parsed_body.fetch("comparison").except("generated_at")
    assert_equal before, financial_snapshot
  end

  test "superseded issued snapshots compare with zero and negative differences while ineligible records are rejected precisely" do
    @estimate.update!(status: "superseded")
    equal_invoice = build_invoice(@practice, @patient, amount: "75.30")
    lower_invoice = build_invoice(@practice, @patient, amount: "75.20")
    draft_estimate = build_estimate(@practice, @patient, issued: false)
    draft_invoice = build_invoice(@practice, @patient, amount: "75.30", status: "draft")
    void_invoice = build_invoice(@practice, @patient, amount: "75.30", status: "void")
    foreign_currency = build_invoice(@practice, @patient, amount: "75.30", currency: "EUR")
    before = financial_snapshot
    [ [ equal_invoice, "0.0" ], [ lower_invoice, "-0.1" ] ].each do |invoice, difference|
      get comparison_path, params: { patient_id: @patient.id, invoice_id: invoice.id }
      assert_response :success
      assert_equal "superseded", response.parsed_body.dig("comparison", "estimate", "status")
      assert_equal difference, response.parsed_body.dig("comparison", "difference_amount")
    end
    [
      [ draft_estimate, @invoice, "Choose an issued estimate snapshot for comparison." ],
      [ @estimate, draft_invoice, "Choose a posted invoice for comparison." ],
      [ @estimate, void_invoice, "Choose a posted invoice for comparison." ],
      [ @estimate, foreign_currency, "The invoice and estimate must use the same currency." ]
    ].each do |estimate, invoice, message|
      get comparison_path(estimate), params: { patient_id: @patient.id, invoice_id: invoice.id }
      assert_response :unprocessable_entity
      assert_equal message, response.parsed_body.fetch("error")
      assert_equal "invalid_request", response.parsed_body.fetch("code")
    end
    assert_equal before, financial_snapshot
  end

  test "foreign practice and wrong patient records cannot be paired while independent patient reads remain available" do
    foreign_patient = @other_practice.patients.create!(display_name: "Foreign patient", reference: "FOREIGN-COMPARE")
    foreign_estimate = build_estimate(@other_practice, foreign_patient)
    foreign_invoice = build_invoice(@other_practice, foreign_patient, amount: "95.30")
    other_estimate = build_estimate(@practice, @other_patient)
    other_invoice = build_invoice(@practice, @other_patient, amount: "95.30")
    before = financial_snapshot
    [
      [ @estimate, @patient, foreign_invoice ],
      [ foreign_estimate, @patient, @invoice ],
      [ @estimate, foreign_patient, foreign_invoice ],
      [ @estimate, @patient, other_invoice ],
      [ other_estimate, @patient, @invoice ]
    ].each do |estimate, patient, invoice|
      get comparison_path(estimate), params: { patient_id: patient.id, invoice_id: invoice.id }
      assert_response :not_found
      refute response.parsed_body.key?("comparison")
    end
    get "/api/clinic/cash_pay_estimates", params: { patient_id: @other_patient.id }
    assert_response :success
    assert_includes response.parsed_body.fetch("estimates").map { |record| record.fetch("id") }, other_estimate.id
    assert_equal before, financial_snapshot
  end

  test "missing IDs and denied billing access produce no comparison or ledger mutation" do
    before = financial_snapshot
    get comparison_path, params: { patient_id: @patient.id }
    assert_response :bad_request
    refute response.parsed_body.key?("comparison")
    denied = User.create!(email_address: "comparison-denied@example.invalid", password: @password)
    @practice.memberships.create!(user: denied)
    sign_in(denied)
    get comparison_path, params: { patient_id: @patient.id, invoice_id: @invoice.id }
    assert_response :forbidden
    refute response.parsed_body.key?("comparison")
    assert_equal before, financial_snapshot
  end

  private

  def build_estimate(practice, patient, issued: true)
    estimate = Clinic::Billing::CashPayEstimate.create!(practice: practice, patient: patient,
      classification: "gfe_candidate", status: "draft", currency: "USD")
    estimate.lines.create!(practice: practice, billing_service: practice == @practice ? @service : nil,
      quantity: "1", unit_amount: "75.10", expected_amount: "75.10", description_snapshot: "Synthetic service", exclusions: "No laboratory charges")
    estimate.lines.create!(practice: practice, quantity: "1", unit_amount: "0.20", expected_amount: "0.20", description_snapshot: "Synthetic additional fee")
    estimate.update!(classification: "issued_gfe", status: "issued", issued_at: Time.current, policy_version: "synthetic-policy-v1") if issued
    estimate
  end

  def build_invoice(practice, patient, amount:, status: "posted", currency: "USD")
    invoice = practice.invoices.create!(patient: patient, currency: currency, status: "draft", rounding_policy_version: Clinic::Billing::Money::POLICY_VERSION)
    invoice.lines.create!(practice: practice, patient: patient, quantity: "1", unit_amount: amount,
      posted_amount: amount, description_snapshot: "Synthetic posted service")
    invoice.update!(status: "posted") unless status == "draft"
    invoice.update!(status: "void") if status == "void"
    invoice
  end

  def comparison_path(estimate = @estimate)
    "/api/clinic/cash_pay_estimates/#{estimate.id}/invoice_comparison"
  end

  def financial_snapshot
    [ Clinic::Billing::CashPayEstimate, Clinic::Billing::CashPayEstimateLine, Clinic::Invoice,
      Clinic::InvoiceLine, Clinic::PaymentEvent, Clinic::CreditNote ].to_h do |model|
      [ model.name, model.order(:id).map(&:attributes) ]
    end
  end

  def sign_in(actor)
    get "/api/csrf"
    token = response.parsed_body.fetch("csrf_token")
    post "/api/session", params: { email_address: actor.email_address, password: @password },
      headers: { "Origin" => "http://localhost:3000", "X-CSRF-Token" => token }, as: :json
    assert_response :success
  end
end
