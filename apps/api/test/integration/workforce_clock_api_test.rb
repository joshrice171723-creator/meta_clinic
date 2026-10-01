require "test_helper"

class WorkforceClockApiTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    practice = Clinic::Practice.create!(name: "Clock API Clinic", timezone: "UTC")
    manager = User.create!(email_address: "clock-api-manager-#{SecureRandom.hex(5)}@example.invalid", password: "Manager-password-123!")
    manager_membership = Clinic::Membership.create!(practice: practice, user: manager)
    employee = User.create!(email_address: "clock-api-employee-#{SecureRandom.hex(5)}@example.invalid", password: "Employee-password-123!")
    membership = Clinic::Membership.create!(practice: practice, user: employee)
    staff = Clinic::Staff::Member.create!(practice: practice, display_name: "Casey Scanner", job_title: "Assistant")
    site = Clinic::Site.create!(practice: practice, code: "KIOSK", name: "Kiosk", status: "active", timezone_override: "UTC")
    employment = Clinic::Workforce::Employment.create!(practice: practice, staff_member: staff, membership: membership, effective_from: 1.day.ago)
    Clinic::Workforce::EmploymentSite.create!(practice: practice, employment: employment, site: site, effective_from: 1.day.ago)
    Clinic::Workforce::SettingsVersion.create!(practice: practice, scope_kind: "practice", revision: 1,
      effective_from: 1.day.ago, created_by_membership: manager_membership, values: settings)
    @badge = Clinic::Workforce::IssueBadge.call(employment: employment, actor_membership: manager_membership)
    @enrollment_token = SecureRandom.urlsafe_base64(32, false)
    Clinic::Workforce::KioskEnrollment.create!(practice: practice, site: site,
      token_digest: Clinic::Workforce::IssueBadge.digest(@enrollment_token), issued_by_membership: manager_membership,
      expires_at: 1.hour.from_now)
    @practice, @manager, @manager_membership, @site, @employment = practice, manager, manager_membership, site, employment
  end

  test "Muse45 configured administrator issues a badge and creates usable enrollment with sanitized readback" do
    grant_permissions!(@manager_membership, "workforce.badges", "workforce.settings")
    post "/api/session", params: { email_address: @manager.email_address, password: "Manager-password-123!" },
      headers: csrf_headers, as: :json
    assert_response :success

    assert_difference "Clinic::Workforce::BadgeCredential.count", 1 do
      post "/api/clinic/workforce/badges", params: { employment_id: @employment.id, site_id: @site.id },
        headers: csrf_headers, as: :json
      assert_response :created
    end
    badge_id = response.parsed_body.fetch("badge").fetch("id")
    printable = response.parsed_body.fetch("printable")
    token = printable.fetch("token")
    assert token.present?
    assert_equal false, printable.fetch("reprintable")
    assert printable.fetch("barcode_svg").include?("<svg")
    badge = Clinic::Workforce::BadgeCredential.find(badge_id)
    assert_equal @employment.id, badge.employment_id
    assert_equal Clinic::Workforce::IssueBadge.digest(token), badge.secret_digest
    assert_equal "replaced", @badge.badge.reload.status
    get "/api/clinic/workforce/badges", params: { site_id: @site.id }, headers: @headers
    assert_response :success
    assert response.parsed_body.fetch("badges").any? { |row| row.fetch("id") == badge_id && row.fetch("status") == "issued" }
    assert !response.body.include?(token), "Badge index must not expose the creation token"
    assert !response.body.include?("secret_digest"), "Badge index must remain metadata-only"

    assert_difference "Clinic::Workforce::KioskEnrollment.count", 1 do
      post "/api/clinic/workforce/kiosks", params: { site_id: @site.id }, headers: csrf_headers, as: :json
      assert_response :created
    end
    enrollment_id = response.parsed_body.fetch("kiosk").fetch("id")
    enrollment_token = response.parsed_body.fetch("enrollment_token")
    assert enrollment_token.present?
    enrollment = Clinic::Workforce::KioskEnrollment.find(enrollment_id)
    assert_equal @practice.id, enrollment.practice_id
    assert_equal @site.id, enrollment.site_id
    assert_equal Clinic::Workforce::IssueBadge.digest(enrollment_token), enrollment.token_digest
    get "/api/clinic/workforce/kiosks", params: { site_id: @site.id }, headers: @headers
    assert_response :success
    assert response.parsed_body.fetch("kiosks").any? { |row| row.fetch("id") == enrollment_id }
    assert !response.body.include?(enrollment_token), "Enrollment index must not expose the creation code"
    assert !response.body.include?("token_digest"), "Enrollment index must remain metadata-only"
    post "/api/workforce/kiosk/enroll", params: { enrollment_token: enrollment_token }, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal true, response.parsed_body.fetch("enrolled")
    assert_equal "enrolled", enrollment.reload.status
  end

  test "enrolled kiosk resolves a badge and replays one saved punch" do
    post "/api/workforce/kiosk/enroll", params: { enrollment_token: @enrollment_token }, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal true, response.parsed_body.fetch("enrolled")

    post "/api/workforce/kiosk/challenges", params: { badge: @badge.token, input_method: "manual" }, headers: csrf_headers, as: :json
    assert_response :created
    challenge = response.parsed_body.fetch("challenge")
    assert_equal [ "clock_in" ], response.parsed_body.fetch("allowed_transitions")
    assert_not_includes response.body, @badge.token

    key = SecureRandom.uuid
    assert_difference("Clinic::Workforce::Punch.count", 1) do
      post "/api/workforce/kiosk/punches", params: { challenge: challenge, event_type: "clock_in", request_key: key }, headers: csrf_headers, as: :json
      assert_response :created
    end
    assert_no_difference("Clinic::Workforce::Punch.count") do
      post "/api/workforce/kiosk/punches", params: { challenge: challenge, event_type: "clock_in", request_key: key }, headers: csrf_headers, as: :json
      assert_response :success
      assert_equal true, response.parsed_body.fetch("replayed")
    end
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def settings
    {
      "timezone" => "UTC", "workweek_start_day" => 0, "workweek_start_time" => "00:00",
      "kiosk_enabled" => true, "scanner_enabled" => true, "camera_enabled" => false,
      "manual_badge_entry_enabled" => true, "pin_required" => false,
      "break_tracking_enabled" => true, "break_mode" => "manual", "break_duration_minutes" => nil,
      "break_paid" => false, "break_reminder_minutes" => nil, "rounding_mode" => "none",
      "rounding_increment_minutes" => nil, "daily_overtime_threshold_minutes" => 480,
      "weekly_overtime_threshold_minutes" => 2400, "overtime_precedence" => "daily_then_weekly",
      "approval_mode" => "manager_required", "schedule_enabled" => true,
      "employee_self_service_enabled" => true, "availability_editing_enabled" => true,
      "time_off_enabled" => true, "shift_swaps_enabled" => false,
      "availability_approval_required" => true, "time_off_approval_required" => true,
      "shift_swap_approval_required" => true, "payroll_export_enabled" => false,
      "pay_cadence" => "unconfigured", "payroll_provider" => "unconfigured", "provider_mapping" => {}
    }
  end
end
