require "test_helper"

class WorkforceTimecardsTest < ActiveSupport::TestCase
  setup do
    @practice = Clinic::Practice.create!(name: "Timecard Test Clinic", timezone: "America/Chicago")
    @manager = User.create!(email_address: "time-manager-#{SecureRandom.hex(5)}@example.invalid", password: "Manager-password-123!")
    @manager_membership = Clinic::Membership.create!(practice: @practice, user: @manager)
    reviewer = User.create!(email_address: "time-reviewer-#{SecureRandom.hex(5)}@example.invalid", password: "Reviewer-password-123!")
    @reviewer_membership = Clinic::Membership.create!(practice: @practice, user: reviewer)
    @employee = User.create!(email_address: "time-employee-#{SecureRandom.hex(5)}@example.invalid", password: "Employee-password-123!")
    @employee_membership = Clinic::Membership.create!(practice: @practice, user: @employee)
    @staff = Clinic::Staff::Member.create!(practice: @practice, display_name: "Riley Hours", job_title: "Coordinator")
    @site = Clinic::Site.create!(practice: @practice, code: "HOURS", name: "Hours site", status: "active", timezone_override: "America/Chicago")
    @employment = Clinic::Workforce::Employment.create!(practice: @practice, staff_member: @staff,
      membership: @employee_membership, effective_from: Time.utc(2026, 8, 1))
    Clinic::Workforce::EmploymentSite.create!(practice: @practice, employment: @employment, site: @site,
      effective_from: Time.utc(2026, 8, 1))
    Clinic::Workforce::SettingsVersion.create!(practice: @practice, scope_kind: "practice", revision: 1,
      effective_from: Time.utc(2026, 8, 1), created_by_membership: @manager_membership, values: settings)
  end

  test "calculation uses UTC intervals, actual breaks, rounding, and frozen policy provenance" do
    create_punch("clock_in", "2026-09-01T13:02:00Z")
    create_punch("break_start", "2026-09-01T17:00:00Z")
    create_punch("break_end", "2026-09-01T17:30:00Z")
    create_punch("clock_out", "2026-09-01T22:07:00Z")

    card = Clinic::Workforce::CalculateTimecard.call(employment: @employment,
      period_start: Date.new(2026, 8, 30), actor_membership: @manager_membership)

    assert_equal 3, card.time_segments.count
    assert_equal 545, card.raw_total_minutes
    assert_equal 540, card.rounded_total_minutes
    assert_equal 480, card.regular_minutes
    assert_equal 30, card.overtime_minutes
    assert_empty card.unresolved_exceptions
    assert_equal 0, card.time_segments.find_by!(segment_kind: "break").paid_minutes
    assert_equal 1, card.settings_provenance.dig(@site.id.to_s, "practice", "revision")
    assert_equal card.source_digest, Clinic::Workforce::CalculateTimecard.current_source_digest(
      employment: @employment, period_start: card.period_start)
  end

  test "open shift remains unresolved and cannot be approved" do
    create_punch("clock_in", "2026-09-01T13:00:00Z")
    card = Clinic::Workforce::CalculateTimecard.call(employment: @employment,
      period_start: Date.new(2026, 8, 30), actor_membership: @manager_membership)

    assert_includes card.unresolved_exceptions, "missing_clock_out"
    card.status = "approved"
    card.approved_at = Time.current
    card.approved_by_membership = @manager_membership
    assert_not card.save
  end

  test "overnight intervals split at local midnight and clip to workweek bounds" do
    create_punch("clock_in", "2026-08-30T04:00:00Z")
    create_punch("clock_out", "2026-08-30T07:00:00Z")
    create_punch("clock_in", "2026-08-31T04:00:00Z")
    create_punch("clock_out", "2026-08-31T06:00:00Z")

    card = Clinic::Workforce::CalculateTimecard.call(employment: @employment,
      period_start: Date.new(2026, 8, 30), actor_membership: @manager_membership)

    assert_equal 3, card.time_segments.count
    assert_equal [ Date.new(2026, 8, 30), Date.new(2026, 8, 31) ],
      card.time_segments.order(:started_at_utc).pluck(:local_date).uniq
    assert_equal 240, card.raw_total_minutes
  end

  test "approved correction creates a successor without editing punches or approved card" do
    create_punch("clock_in", "2026-09-01T13:00:00Z")
    create_punch("clock_out", "2026-09-01T21:00:00Z")
    card = Clinic::Workforce::CalculateTimecard.call(employment: @employment,
      period_start: Date.new(2026, 8, 30), actor_membership: @manager_membership)
    card.update!(status: "submitted", submitted_at: Time.current, submitted_by_membership: @employee_membership)
    card.update!(status: "approved", approved_at: Time.current, approved_by_membership: @manager_membership)
    original_punches = Clinic::Workforce::Punch.where(employment: @employment).pluck(:id, :occurred_at_utc)
    request_record = Clinic::Workforce::AdjustmentRequest.create!(practice: @practice, employment: @employment,
      timecard_version: card, status: "submitted", correction_type: "add_segment",
      proposed_changes: { "site_id" => @site.id, "started_at_utc" => "2026-09-02T13:00:00Z", "ended_at_utc" => "2026-09-02T14:00:00Z" },
      reason: "Manager verified a missed clock-in from local records", requested_by_membership: @manager_membership,
      requested_at: Time.current, request_key: SecureRandom.uuid, payload_digest: "a" * 64,
      source_lock_version: card.lock_version)

    decided = Clinic::Workforce::DecideAdjustment.call(adjustment: request_record, reviewer: @reviewer_membership,
      decision: "approved", decision_reason: "Verified and approved", expected_lock_version: request_record.lock_version)

    successor = decided.resulting_timecard_version
    assert_equal card.id, successor.previous_version_id
    assert_equal card.version_number + 1, successor.version_number
    assert_equal "approved", card.reload.status
    assert_equal original_punches, Clinic::Workforce::Punch.where(employment: @employment).pluck(:id, :occurred_at_utc)
    assert_not card.update(status: "draft")
  end

  private

  def create_punch(event_type, timestamp)
    instant = Time.iso8601(timestamp)
    local = instant.in_time_zone(@site.timezone_override)
    Clinic::Workforce::Punch.create!(practice: @practice, site: @site, employment: @employment,
      event_type: event_type, occurred_at_utc: instant, time_zone: @site.timezone_override,
      utc_offset_seconds: local.utc_offset, local_date: local.to_date, source: "manager_correction",
      request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(32), correlation_id: SecureRandom.uuid,
      received_at: instant, result_snapshot: {})
  end

  def settings
    {
      "timezone" => "America/Chicago", "workweek_start_day" => 0, "workweek_start_time" => "00:00",
      "kiosk_enabled" => true, "scanner_enabled" => true, "camera_enabled" => false,
      "manual_badge_entry_enabled" => true, "pin_required" => false,
      "break_tracking_enabled" => true, "break_mode" => "manual", "break_duration_minutes" => 30,
      "break_paid" => false, "break_reminder_minutes" => 5, "rounding_mode" => "nearest",
      "rounding_increment_minutes" => 15, "daily_overtime_threshold_minutes" => 480,
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
