require "test_helper"

class ClinicCloseoutLoadingDiagnosisTest < ActionDispatch::IntegrationTest
  REPORTS = %w[daily_invoices daily_payment_activity daily_cash_drawers].freeze

  setup do
    @practice = Clinic::Practice.create!(name: "Disposable synthetic closeout clinic", timezone: "UTC")
    @password = SecureRandom.hex(24)
    @actor = User.create!(email_address: "closeout-#{SecureRandom.hex(6)}@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @actor)
    # Existing action codes, ordinary isolated test-helper grants only.
    grant_permissions!(@membership, "billing.read", "billing.cash_reconcile")
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    get "/api/csrf", headers: @headers
    post "/api/session", params: { email_address: @actor.email_address, password: @password },
      headers: @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token")), as: :json
    assert_response :success
  end

  test "all three empty closeout reports complete with report envelopes" do
    REPORTS.each do |name|
      get "/api/clinic/reports/#{name}", params: { date: Date.current.iso8601 }, headers: @headers
      assert_response :success
      report = response.parsed_body.fetch("report")
      assert_equal Date.current.iso8601, report.fetch("date")
      assert_equal "Etc/UTC", report.fetch("timezone")
      case name
      when "daily_payment_activity"
        assert_empty report.fetch("payment_records")
        assert_empty report.fetch("refund_records")
      else
        assert_empty report.fetch("records")
      end
    end
  end

  test "all three denied reports complete with explicit errors" do
    revoke_all_permissions!(@membership)
    REPORTS.each do |name|
      get "/api/clinic/reports/#{name}", params: { date: Date.current.iso8601 }, headers: @headers
      assert_response :forbidden
      assert response.parsed_body.fetch("error").present?
      assert_nil response.parsed_body["report"]
    end
  end

  test "all three invalid dates complete with explicit errors" do
    REPORTS.each do |name|
      get "/api/clinic/reports/#{name}", params: { date: "not-a-date" }, headers: @headers
      assert_response :bad_request
      assert response.parsed_body.fetch("error").present?
    end
  end
end
