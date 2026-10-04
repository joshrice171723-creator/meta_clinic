require "test_helper"

class WorkforceClockTest < ActiveSupport::TestCase
  setup do
    @practice = Clinic::Practice.create!(name: "Clock Test Clinic", timezone: "UTC")
    @manager = User.create!(email_address: "clock-manager-#{SecureRandom.hex(5)}@example.invalid", password: "Manager-password-123!")
    @manager_membership = Clinic::Membership.create!(practice: @practice, user: @manager)
    @employee = User.create!(email_address: "clock-employee-#{SecureRandom.hex(5)}@example.invalid", password: "Employee-password-123!")
    @employee_membership = Clinic::Membership.create!(practice: @practice, user: @employee)
    @staff = Clinic::Staff::Member.create!(practice: @practice, display_name: "Morgan Clock", job_title: "Assistant")
    @site = Clinic::Site.create!(practice: @practice, code: "CLOCK", name: "Clock site", status: "active", timezone_override: "UTC")
    @employment = Clinic::Workforce::Employment.create!(practice: @practice, staff_member: @staff,
      membership: @employee_membership, effective_from: 1.day.ago)
    Clinic::Workforce::EmploymentSite.create!(practice: @practice, employment: @employment, site: @site, effective_from: 1.day.ago)
    Clinic::Workforce::SettingsVersion.create!(practice: @practice, scope_kind: "practice", revision: 1,
      effective_from: 14.days.ago, created_by_membership: @manager_membership, values: settings)
    enrollment = Clinic::Workforce::KioskEnrollment.create!(practice: @practice, site: @site,
      token_digest: Digest::SHA256.hexdigest("enrollment"), issued_by_membership: @manager_membership,
      expires_at: 1.day.from_now, enrolled_at: Time.current, status: "enrolled")
    @kiosk = Clinic::Workforce::KioskSession.create!(practice: @practice, site: @site,
      kiosk_enrollment: enrollment, session_digest: Digest::SHA256.hexdigest("session"),
      expires_at: 1.day.from_now, last_seen_at: Time.current)
  end

  test "badge issuance returns one printable Code 128 token but stores only digests" do
    first = Clinic::Workforce::IssueBadge.call(employment: @employment, actor_membership: @manager_membership, pin: "8246")

    assert first.token.present?
    assert_includes first.barcode_svg, "<svg"
    assert_includes first.barcode_svg, "Employee clock badge barcode"
    assert_not_equal first.token, first.badge.secret_digest
    assert_not_includes first.badge.attributes.to_json, first.token
    assert first.badge.pin_matches?("8246")
    assert_not first.badge.pin_matches?("1111")

    second = Clinic::Workforce::IssueBadge.call(employment: @employment, actor_membership: @manager_membership)
    assert_equal "replaced", first.badge.reload.status
    assert_equal second.badge.id, Clinic::Workforce::BadgeCredential.active.find_by!(employment: @employment).id
  end

  test "a successful punch retry is replayed before consumed challenge rejection" do
    badge = Clinic::Workforce::IssueBadge.call(employment: @employment, actor_membership: @manager_membership)
    resolved = Clinic::Workforce::ResolveBadgeChallenge.call(kiosk_session: @kiosk, badge_token: badge.token, input_method: "manual")
    request_key = SecureRandom.uuid
    now = Time.current

    first = Clinic::Workforce::RecordPunch.call(kiosk_session: @kiosk, challenge_token: resolved.token,
      event_type: "clock_in", request_key: request_key, now: now)
    replay = Clinic::Workforce::RecordPunch.call(kiosk_session: @kiosk, challenge_token: resolved.token,
      event_type: "clock_in", request_key: request_key, now: now + 1.second)

    assert_not first.replayed
    assert replay.replayed
    assert_equal first.punch.id, replay.punch.id
    assert_equal 1, Clinic::Workforce::Punch.where(employment: @employment).count
    assert resolved.challenge.reload.consumed_at.present?

    reminder = Clinic::Workforce::ResolveBadgeChallenge.call(kiosk_session: @kiosk,
      badge_token: badge.token, input_method: "manual", now: now + 61.minutes)
    assert_equal 30, reminder.break_target_minutes
    assert reminder.break_reminder_due
  end

  test "invalid transition and changed retry payload do not create another punch" do
    badge = Clinic::Workforce::IssueBadge.call(employment: @employment, actor_membership: @manager_membership)
    resolved = Clinic::Workforce::ResolveBadgeChallenge.call(kiosk_session: @kiosk, badge_token: badge.token, input_method: "manual")
    request_key = SecureRandom.uuid
    Clinic::Workforce::RecordPunch.call(kiosk_session: @kiosk, challenge_token: resolved.token,
      event_type: "clock_in", request_key: request_key)

    assert_raises(Clinic::Workforce::RecordPunch::Conflict) do
      Clinic::Workforce::RecordPunch.call(kiosk_session: @kiosk, challenge_token: resolved.token,
        event_type: "clock_out", request_key: request_key)
    end
    assert_equal 1, Clinic::Workforce::Punch.where(employment: @employment).count
  end

  test "an approved missing clock-out correction permits the next clock-in" do
    started_at = 2.hours.ago
    local = started_at.in_time_zone(@site.timezone_override)
    open_punch = Clinic::Workforce::Punch.create!(practice: @practice, site: @site, employment: @employment,
      event_type: "clock_in", occurred_at_utc: started_at, time_zone: @site.timezone_override,
      utc_offset_seconds: local.utc_offset, local_date: local.to_date, source: "manager_correction",
      request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(32), correlation_id: SecureRandom.uuid,
      received_at: started_at, result_snapshot: {}, created_at: started_at, updated_at: started_at)
    period_start = Clinic::Workforce::CalculateTimecard.current_period_start(practice: @practice)
    card = Clinic::Workforce::CalculateTimecard.call(employment: @employment, period_start: period_start,
      actor_membership: @manager_membership)
    Clinic::Workforce::AdjustmentRequest.create!(practice: @practice, employment: @employment,
      timecard_version: card, status: "approved", correction_type: "add_segment",
      proposed_changes: { "site_id" => @site.id, "started_at_utc" => started_at.utc.iso8601,
        "ended_at_utc" => 1.hour.ago.utc.iso8601, "resolves_open_punch_id" => open_punch.id },
      reason: "Manager verified the missing clock-out", requested_by_membership: @employee_membership,
      requested_at: 30.minutes.ago, reviewed_by_membership: @manager_membership, reviewed_at: 20.minutes.ago,
      decision_reason: "Verified against location records", request_key: SecureRandom.uuid,
      payload_digest: SecureRandom.hex(32), source_lock_version: card.lock_version)

    assert_equal [ "clock_in" ], Clinic::Workforce::RecordPunch.allowed_transitions(employment: @employment)
    badge = Clinic::Workforce::IssueBadge.call(employment: @employment, actor_membership: @manager_membership)
    resolved = Clinic::Workforce::ResolveBadgeChallenge.call(kiosk_session: @kiosk,
      badge_token: badge.token, input_method: "manual")
    result = Clinic::Workforce::RecordPunch.call(kiosk_session: @kiosk, challenge_token: resolved.token,
      event_type: "clock_in", request_key: SecureRandom.uuid)

    assert_equal "clock_in", result.punch.event_type
    assert_equal 2, Clinic::Workforce::Punch.where(employment: @employment).count
  end

  test "challenge transitions use the explicit terminal time rather than a simulated future" do
    now = Time.current.change(usec: 0)
    travel_to now do
      started_at = now - 2.hours
      open_punch = Clinic::Workforce::Punch.create!(practice: @practice, site: @site, employment: @employment,
        event_type: "clock_in", occurred_at_utc: started_at, time_zone: "UTC",
        utc_offset_seconds: 0, local_date: started_at.to_date, source: "manager_correction",
        request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(32), correlation_id: SecureRandom.uuid,
        received_at: started_at, result_snapshot: {}, created_at: started_at, updated_at: started_at)
      card = Clinic::Workforce::CalculateTimecard.call(employment: @employment,
        period_start: Clinic::Workforce::CalculateTimecard.current_period_start(practice: @practice),
        actor_membership: @manager_membership)
      Clinic::Workforce::AdjustmentRequest.create!(practice: @practice, employment: @employment,
        timecard_version: card, status: "approved", correction_type: "add_segment",
        proposed_changes: { "site_id" => @site.id, "started_at_utc" => started_at.utc.iso8601,
          "ended_at_utc" => (now + 1.hour).utc.iso8601, "resolves_open_punch_id" => open_punch.id },
        reason: "Synthetic future correction boundary", requested_by_membership: @employee_membership,
        requested_at: now - 30.minutes, reviewed_by_membership: @manager_membership, reviewed_at: now - 20.minutes,
        decision_reason: "Synthetic clock boundary verification", request_key: SecureRandom.uuid,
        payload_digest: SecureRandom.hex(32), source_lock_version: card.lock_version)
      badge = Clinic::Workforce::IssueBadge.call(employment: @employment, actor_membership: @manager_membership)
      original = Current.method(:business_time)
      begin
        Current.define_singleton_method(:business_time) { now + 2.hours }
        resolved = Clinic::Workforce::ResolveBadgeChallenge.call(kiosk_session: @kiosk,
          badge_token: badge.token, input_method: "manual", now: now)
        assert_includes resolved.permitted_transitions, "clock_out"
        assert_not_includes resolved.permitted_transitions, "clock_in"
        result = Clinic::Workforce::RecordPunch.call(kiosk_session: @kiosk, challenge_token: resolved.token,
          event_type: "clock_out", request_key: SecureRandom.uuid, now: now)
        assert_equal "clock_out", result.punch.event_type
      ensure
        Current.define_singleton_method(:business_time, original)
      end
    end
  end

  private

  def settings
    {
      "timezone" => "UTC", "workweek_start_day" => 0, "workweek_start_time" => "00:00",
      "kiosk_enabled" => true, "scanner_enabled" => true, "camera_enabled" => true,
      "manual_badge_entry_enabled" => true, "pin_required" => false,
      "break_tracking_enabled" => true, "break_mode" => "manual", "break_duration_minutes" => 30,
      "break_paid" => false, "break_reminder_minutes" => 60, "rounding_mode" => "nearest",
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
