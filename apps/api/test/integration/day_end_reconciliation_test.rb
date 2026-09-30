require "test_helper"

class DayEndReconciliationTest < ActionDispatch::IntegrationTest
  setup do
    @practice = Clinic::Practice.create!(name: "Synthetic day-end", timezone: "UTC")
    @site = @practice.sites.create!(code: "CLOSE")
    @other_site = @practice.sites.create!(code: "OTHER")
    @patient = @practice.patients.create!(display_name: "Synthetic comparison", reference: "CLOSE-1")
    @password = SecureRandom.hex(18)
    @actor = User.create!(email_address: "day-end@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "billing.read", "billing.cash_reconcile")
    grant_permissions!(@membership, "appointments.read", scope_kind: "site", site: @site)
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000" }
    post "/api/session", params: { email_address: @actor.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
    @date = Time.current.utc.to_date
    @invoice = @practice.invoices.create!(patient: @patient, currency: "USD", status: "draft", rounding_policy_version: "synthetic-v1")
    @visit = Clinic::Appointment.create!(practice: @practice, site: @site, patient: @patient,
      starts_at: Time.current.utc.beginning_of_day + 12.hours, ends_at: Time.current.utc.beginning_of_day + 13.hours,
      status: "scheduled", visit_modality: "in_person")
  end

  test "identified source comparison persists attributed values and exact replay after source changes" do
    captured = preview
    assert_equal [ @invoice.id ], captured.dig("snapshot", "reconciliation", "sources", "invoices").map { |row| row.fetch("id") }
    assert_equal [ @visit.id ], captured.dig("snapshot", "reconciliation", "sources", "visits").map { |row| row.fetch("id") }
    assert_equal [], captured.dig("snapshot", "reconciliation", "sources", "credits")
    input = operation(captured)
    before = [ @invoice.reload.attributes, @visit.reload.attributes, Clinic::CashDrawerSession.count, Clinic::PaymentEvent.count ]
    save(input)
    assert_response :created
    receipt = response.parsed_body.fetch("review")
    assert_equal @actor.email_address, receipt.fetch("reviewed_by")
    assert_equal "follow_up_required", receipt.dig("snapshot", "reconciliation", "outcome")
    assert_equal captured.fetch("source_digest"), receipt.dig("snapshot", "reconciliation", "source_digest")
    assert_equal before, [ @invoice.reload.attributes, @visit.reload.attributes, Clinic::CashDrawerSession.count, Clinic::PaymentEvent.count ]
    @visit.update!(status: "cancelled")
    save(input)
    assert_response :created
    assert_equal receipt, response.parsed_body.fetch("review")
    assert_equal 1, Clinic::DayEndReview.where(practice: @practice).count
    get "/api/clinic/day_end_reviews", params: { date: @date.iso8601 }
    assert_response :success
    assert_equal "scheduled", response.parsed_body.dig("reviews", 0, "snapshot", "reconciliation", "sources", "visits", 0, "status")
    save(input.merge(comparison_outcome: "no_discrepancy_observed"))
    assert_response :conflict
    assert_equal "idempotency_conflict", response.parsed_body.fetch("code")
  end

  test "changed sources and unsupported outcomes cannot save a partial or invented reconciliation" do
    captured = preview
    @visit.update!(status: "cancelled")
    save(operation(captured))
    assert_response :conflict
    assert_equal "source_changed", response.parsed_body.fetch("code")
    assert_equal 0, Clinic::DayEndReview.where(practice: @practice).count
    save(operation(preview).merge(comparison_outcome: "settled"))
    assert_response :unprocessable_entity
    assert_equal 0, Clinic::DayEndReview.where(practice: @practice).count
    save(operation(preview).merge(source_digest: "x" * 64))
    assert_response :unprocessable_entity
    assert_equal 0, Clinic::DayEndReview.where(practice: @practice).count
  end

  test "site and practice authorization is rechecked for preview save history and exact replay" do
    captured = preview
    input = operation(captured)
    save(input)
    assert_response :created
    get "/api/clinic/day_end_reviews/preview", params: { date: @date.iso8601, site_id: @other_site.id }
    assert_response :forbidden
    foreign = Clinic::Practice.create!(name: "Foreign comparison", timezone: "UTC").sites.create!(code: "FOREIGN")
    save(input.merge(site_id: foreign.id, request_key: SecureRandom.uuid))
    assert_response :not_found
    @membership.role_grants.where(site: @site).find_each { |grant| grant.update!(revoked_at: Time.current) }
    get "/api/clinic/day_end_reviews", params: { date: @date.iso8601 }
    assert_response :success
    assert_empty response.parsed_body.fetch("reviews")
    save(input)
    assert_response :forbidden
    @membership.role_grants.find_each { |grant| grant.update!(revoked_at: Time.current) }
    get "/api/clinic/day_end_reviews/preview", params: { date: @date.iso8601, site_id: @site.id }
    assert_response :forbidden
    refute response.parsed_body.key?("snapshot")
  end

  test "source capture includes records beyond report page one and rejects oversized cohorts" do
    25.times { @practice.invoices.create!(patient: @patient, currency: "USD", status: "draft", rounding_policy_version: "synthetic-v1") }
    captured = preview
    assert_equal 26, captured.dig("snapshot", "reconciliation", "sources", "invoices").length
    475.times { @practice.invoices.create!(patient: @patient, currency: "USD", status: "draft", rounding_policy_version: "synthetic-v1") }
    get "/api/clinic/day_end_reviews/preview", params: { date: @date.iso8601, site_id: @site.id }
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "No partial reconciliation"
    assert_equal 0, Clinic::DayEndReview.where(practice: @practice).count
  end

  test "legacy summary reviews remain replay compatible without asserting source reconciliation" do
    input = { date: @date.iso8601, review_note: "Summary reviewed", request_key: SecureRandom.uuid }
    save(input)
    assert_response :created
    receipt = response.parsed_body.fetch("review")
    refute receipt.fetch("snapshot").key?("reconciliation")
    save(input)
    assert_response :created
    assert_equal receipt, response.parsed_body.fetch("review")
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def preview
    get "/api/clinic/day_end_reviews/preview", params: { date: @date.iso8601, site_id: @site.id }
    assert_response :success
    assert_equal "no-store", response.headers["Cache-Control"]
    response.parsed_body
  end

  def operation(captured)
    { date: @date.iso8601, site_id: @site.id, review_note: "Compare source records; follow up locally",
      comparison_outcome: "follow_up_required", source_digest: captured.fetch("source_digest"), request_key: SecureRandom.uuid }
  end

  def save(input)
    post "/api/clinic/day_end_reviews", params: { day_end_review: input }, headers: csrf_headers, as: :json
  end
end
