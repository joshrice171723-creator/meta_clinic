require "test_helper"

class ClinicDailyVisitsByStateReportTest < ActionDispatch::IntegrationTest
  setup do
    @practice = Clinic::Practice.create!(name: "Daily report practice", timezone: "America/Chicago")
    @other_practice = Clinic::Practice.create!(name: "Foreign daily report practice", timezone: "UTC")
    @site = @practice.sites.create!(code: "WEST", timezone_override: "America/Los_Angeles")
    @other_site = @practice.sites.create!(code: "EAST")
    @foreign_site = @other_practice.sites.create!(code: "FOREIGN")
    @patient = @practice.patients.create!(display_name: "Synthetic report patient", reference: "REPORT-1")
    @foreign_patient = @other_practice.patients.create!(display_name: "Foreign report patient", reference: "REPORT-2")
    password = SecureRandom.hex(18)
    @actor = User.create!(email_address: "daily-report@example.invalid", password: password)
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "appointments.read", scope_kind: "site", site: @site)
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    post "/api/session", params: { email_address: @actor.email_address, password: password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "site report counts current appointment states once without disclosing patients" do
    date = Date.new(2026, 3, 8)
    local_start = ActiveSupport::TimeZone["America/Los_Angeles"].local(2026, 3, 8, 23, 30)
    appointment = appointment_at(practice: @practice, patient: @patient, site: @site, starts_at: local_start, status: "scheduled")
    appointment_at(practice: @practice, patient: @patient, site: @site, starts_at: local_start - 2.hours, status: "cancelled")
    appointment_at(practice: @practice, patient: @patient, site: @other_site, starts_at: local_start, status: "confirmed")
    appointment_at(practice: @other_practice, patient: @foreign_patient, site: @foreign_site, starts_at: local_start, status: "no_show")

    report = fetch_report(date: date, site: @site)
    assert_equal 1, report.dig("counts", "scheduled")
    assert_equal 1, report.dig("counts", "cancelled")
    assert_equal 0, report.dig("counts", "confirmed")
    assert_equal 2, report.fetch("total")
    assert_equal 0, report.fetch("unassigned_site_count")
    assert_equal "America/Los_Angeles", report.fetch("timezone")
    assert_equal 23.hours, Time.iso8601(report.fetch("interval_end")) - Time.iso8601(report.fetch("interval_start"))
    assert_equal "live_source_query_no_cache", report.fetch("freshness")
    assert_equal 1, report.dig("definition", "revision")
    assert_equal "starts_at", report.dig("definition", "date_basis")
    assert Time.iso8601(report.fetch("as_of")) <= Time.current
    assert_not_includes response.body, @patient.display_name
    assert_not_includes response.body, @patient.reference

    appointment.update!(status: "no_show")
    refreshed = fetch_report(date: date, site: @site)
    assert_equal 0, refreshed.dig("counts", "scheduled")
    assert_equal 1, refreshed.dig("counts", "no_show")
  end

  test "site grants cannot read other sites or whole practice and foreign site is hidden" do
    fetch_report(date: Date.new(2026, 3, 8), site: @other_site, expected_status: :forbidden)
    fetch_report(date: Date.new(2026, 3, 8), expected_status: :forbidden)
    fetch_report(date: Date.new(2026, 3, 8), site: @foreign_site, expected_status: :not_found)
  end

  test "practice report includes unassigned sites and uses practice local date" do
    grant_permissions!(@membership, "appointments.read")
    date = Date.new(2026, 7, 1)
    la_evening = ActiveSupport::TimeZone["America/Los_Angeles"].local(2026, 7, 1, 23, 30)
    appointment_at(practice: @practice, patient: @patient, site: @site, starts_at: la_evening, status: "confirmed")
    appointment_at(practice: @practice, patient: @patient, site: nil, starts_at: la_evening - 1.day, status: "completed")

    report = fetch_report(date: date)
    assert_nil report.fetch("site_id")
    assert_equal "America/Chicago", report.fetch("timezone")
    assert_equal 1, report.fetch("total")
    assert_equal 1, report.fetch("unassigned_site_count")
    assert_equal 1, report.dig("counts", "completed")
    assert_equal 0, report.dig("counts", "confirmed")
  end

  private

  def appointment_at(practice:, patient:, site:, starts_at:, status:)
    Clinic::Appointment.create!(practice: practice, patient: patient, site: site, starts_at: starts_at,
      ends_at: starts_at + 30.minutes, status: status, visit_modality: "in_person")
  end

  def fetch_report(date:, site: nil, expected_status: :success)
    query = { date: date.iso8601 }
    query[:site_id] = site.id if site
    get "/api/clinic/reports/daily_visits_by_state", params: query, headers: @headers
    assert_response expected_status
    response.parsed_body["report"] if response.successful?
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
