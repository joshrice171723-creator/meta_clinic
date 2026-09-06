require "test_helper"

class WorkforcePayrollJourneyTest < ActionDispatch::IntegrationTest
  PASSWORD = "Workforce-payroll-journey-2026!".freeze

  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }

    @practice = Clinic::Practice.create!(name: "Payroll Journey Clinic", timezone: "UTC")
    @site = @practice.sites.create!(code: "PAY", name: "Payroll clinic", status: "active", timezone_override: "UTC")
    @manager = create_user("payroll-manager")
    @manager_membership = @practice.memberships.create!(user: @manager)
    grant_permissions!(@manager_membership, "workforce.settings", "workforce.timecards.read",
      "workforce.timecards.review", "workforce.timecards.approve",
      "workforce.payroll.configure", "workforce.payroll.export")

    employee = create_user("payroll-employee")
    employee_membership = @practice.memberships.create!(user: employee)
    directory_entry = @practice.staff_members.create!(display_name: "Jordan Payroll",
      job_title: "Clinic coordinator", active: true)
    @period_start = Date.current.beginning_of_week(:monday) - 1.week
    @employment = Clinic::Workforce::Employment.create!(practice: @practice,
      staff_member: directory_entry, membership: employee_membership, status: "active",
      effective_from: @period_start.beginning_of_day - 2.days)
    @employment.employment_sites.create!(practice: @practice, site: @site, active: true,
      effective_from: @period_start.beginning_of_day - 2.days)
  end

  test "manager completes a payroll export journey and policy is rechecked" do
    login(@manager)
    save_settings(payroll_export_enabled: true, expected_revision: 0,
      effective_from: @period_start.beginning_of_day - 1.day)

    configuration = configure_payroll
    create_punch("clock_in", @period_start.in_time_zone("UTC").change(hour: 9))
    create_punch("clock_out", @period_start.in_time_zone("UTC").change(hour: 17))

    post "/api/clinic/workforce/timecards/calculate", params: {
      employment_id: @employment.id,
      period_start: @period_start.iso8601
    }, headers: csrf_headers, as: :json
    assert_response :created
    card = response.parsed_body.fetch("timecard")
    assert_empty card.fetch("unresolved_exceptions")
    assert_equal 480, card.dig("snapshot", "totals", "paid_minutes")

    post "/api/clinic/workforce/timecards/#{card.fetch('id')}/submit",
      params: { lock_version: card.fetch("lock_version") }, headers: csrf_headers, as: :json
    assert_response :success
    submitted = response.parsed_body.fetch("timecard")
    assert_equal "submitted", submitted.fetch("status")

    post "/api/clinic/workforce/timecards/#{card.fetch('id')}/approve",
      params: { lock_version: submitted.fetch("lock_version") }, headers: csrf_headers, as: :json
    assert_response :success
    approved = response.parsed_body.fetch("timecard")
    assert_equal "approved", approved.fetch("status")

    export_params = {
      configuration_version_id: configuration.fetch("id"),
      timecard_version_ids: [ approved.fetch("id") ],
      idempotency_key: SecureRandom.uuid
    }
    assert_no_difference("Clinic::Workforce::ExportBatch.count") do
      post "/api/clinic/workforce/payroll-exports/preview", params: export_params,
        headers: csrf_headers, as: :json
      assert_response :success
      assert_equal "8.0", response.parsed_body.dig("totals", "paid_hours")
    end

    post "/api/clinic/workforce/payroll-exports", params: export_params,
      headers: csrf_headers, as: :json
    assert_response :created
    first_batch = response.parsed_body.fetch("batch")
    assert_equal 1, first_batch.fetch("row_count")

    assert_no_difference("Clinic::Workforce::ExportBatch.count") do
      post "/api/clinic/workforce/payroll-exports", params: export_params,
        headers: csrf_headers, as: :json
      assert_response :created
      assert_equal first_batch, response.parsed_body.fetch("batch")
    end

    get first_batch.fetch("download_url"), headers: @headers
    assert_response :success
    assert_equal "text/csv", response.media_type
    assert_includes response.body, '"Payroll employee ID"'
    assert_includes response.body, '"PAY-001"'
    assert_includes response.body, '"8.0"'

    save_settings(payroll_export_enabled: false, expected_revision: 1,
      effective_from: 1.second.ago)
    post "/api/clinic/workforce/payroll-exports/preview",
      params: export_params.merge(idempotency_key: SecureRandom.uuid), headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal "Payroll exports are disabled for this location", response.parsed_body.fetch("error")

    revoke_all_permissions!(@manager_membership)
    get first_batch.fetch("download_url"), headers: @headers
    assert_response :forbidden
  end

  private

  def create_user(label)
    User.create!(email_address: "#{label}-#{SecureRandom.hex(5)}@example.invalid",
      password: PASSWORD, active: true)
  end

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: PASSWORD },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def save_settings(payroll_export_enabled:, expected_revision:, effective_from:)
    put "/api/clinic/workforce/settings", params: {
      workforce_settings: {
        scope_kind: "practice",
        effective_from: effective_from.iso8601,
        expected_revision: expected_revision,
        values: settings_values(payroll_export_enabled: payroll_export_enabled)
      }
    }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal expected_revision + 1, response.parsed_body.fetch("settings_version").fetch("revision")
  end

  def configure_payroll
    post "/api/clinic/workforce/payroll-exports/configuration", params: {
      site_id: @site.id,
      configuration: {
        name: "Weekly payroll hours",
        effective_from: 1.minute.ago.iso8601,
        expected_revision: 0,
        columns: [
          { field: "employee_id", header: "Payroll employee ID" },
          { field: "work_date", header: "Work date" },
          { field: "location_code", header: "Location" },
          { field: "regular_hours", header: "Regular hours" },
          { field: "overtime_hours", header: "Overtime hours" },
          { field: "paid_hours", header: "Paid hours" }
        ],
        employee_identifiers: { @employment.id.to_s => "PAY-001" }
      }
    }, headers: csrf_headers, as: :json
    assert_response :created
    response.parsed_body.fetch("configuration")
  end

  def create_punch(event_type, instant)
    Clinic::Workforce::Punch.create!(practice: @practice, site: @site, employment: @employment,
      event_type: event_type, occurred_at_utc: instant, time_zone: "UTC", utc_offset_seconds: 0,
      local_date: instant.to_date, source: "manager_correction", request_key: SecureRandom.uuid,
      payload_digest: SecureRandom.hex(32), correlation_id: SecureRandom.uuid,
      received_at: instant, result_snapshot: {})
  end

  def settings_values(payroll_export_enabled:)
    {
      timezone: "UTC", workweek_start_day: 1, workweek_start_time: "00:00",
      kiosk_enabled: true, scanner_enabled: true, camera_enabled: false,
      manual_badge_entry_enabled: true, pin_required: false,
      break_tracking_enabled: true, break_mode: "manual", break_duration_minutes: 30,
      break_paid: false, break_reminder_minutes: 5, rounding_mode: "none",
      rounding_increment_minutes: nil, daily_overtime_threshold_minutes: 480,
      weekly_overtime_threshold_minutes: 2400, overtime_precedence: "daily_then_weekly",
      approval_mode: "manager_required", schedule_enabled: true,
      employee_self_service_enabled: true, availability_editing_enabled: true,
      time_off_enabled: true, shift_swaps_enabled: false,
      availability_approval_required: true, time_off_approval_required: true,
      shift_swap_approval_required: true, payroll_export_enabled: payroll_export_enabled,
      pay_cadence: "weekly", payroll_provider: "custom_file", provider_mapping: {}
    }
  end
end
