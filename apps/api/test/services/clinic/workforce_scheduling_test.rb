require "test_helper"

class WorkforceSchedulingTest < ActiveSupport::TestCase
  AccessStub = Struct.new(:employment, :allowed) do
    def own_employment = employment

    def authorize!(*, **)
      raise Clinic::Authorization::Denied unless allowed
    end
  end

  setup do
    @practice = Clinic::Practice.create!(name: "Workforce schedule test practice", timezone: "America/Chicago")
    @manager = create_employee("manager", @practice)
    @employee = create_employee("employee", @practice)
    @target = create_employee("target", @practice)
    @site = @practice.sites.create!(code: "MAIN", name: "Main workforce site", status: "active", timezone_override: "America/Chicago")
    @other_site = @practice.sites.create!(code: "NORTH", name: "North workforce site", status: "active", timezone_override: "America/Chicago")
    [ @employee, @target ].each do |employment|
      [ @site, @other_site ].each do |site|
        employment.employment_sites.create!(practice: @practice, site: site, active: true, effective_from: 1.day.ago)
      end
    end
    Clinic::Workforce::SettingsVersion.create!(practice: @practice, scope_kind: "practice", revision: 1,
      effective_from: 1.day.ago, created_by_membership: @manager.membership, values: settings)
  end

  test "resolves overnight shifts and requires an explicit DST occurrence" do
    overnight = Clinic::Workforce::ResolveLocalInterval.call(timezone: "America/Chicago",
      local_start: "2026-09-07T22:00", local_end: "2026-09-07T06:00")
    assert_equal 8.hours, overnight[:ends_at] - overnight[:starts_at]

    assert_raises(Clinic::Workforce::ResolveLocalInterval::InvalidLocalTime) do
      Clinic::Workforce::ResolveLocalInterval.call(timezone: "America/Chicago",
        local_start: "2026-03-08T02:30", local_end: "2026-03-08T03:30")
    end
    assert_raises(Clinic::Workforce::ResolveLocalInterval::InvalidLocalTime) do
      Clinic::Workforce::ResolveLocalInterval.call(timezone: "America/Chicago",
        local_start: "2026-11-01T01:30", local_end: "2026-11-01T03:00")
    end
    first = Clinic::Workforce::ResolveLocalInterval.call(timezone: "America/Chicago",
      local_start: "2026-11-01T01:30", local_end: "2026-11-01T03:00", start_occurrence: "first")
    second = Clinic::Workforce::ResolveLocalInterval.call(timezone: "America/Chicago",
      local_start: "2026-11-01T01:30", local_end: "2026-11-01T03:00", start_occurrence: "second")
    assert_equal 1.hour, second[:starts_at] - first[:starts_at]
  end

  test "publication is immutable retryable and rejects stale drafts" do
    draft = draft_with_shift(@site, @employee, "2026-09-07T09:00", "2026-09-07T17:00")
    publication = Clinic::Workforce::PublishSchedule.call(draft: draft, actor: @manager.membership.user,
      expected_revision: 1, idempotency_key: "publish-retry")
    retry_result = Clinic::Workforce::PublishSchedule.call(draft: draft, actor: @manager.membership.user,
      expected_revision: 1, idempotency_key: "publish-retry")
    assert_equal publication.id, retry_result.id
    assert_not publication.update(version: 99)

    stale = draft_with_shift(@site, @employee, "2026-09-08T09:00", "2026-09-08T17:00")
    stale.update!(revision: 2)
    assert_raises(ActiveRecord::StaleObjectError) do
      Clinic::Workforce::PublishSchedule.call(draft: stale, actor: @manager.membership.user,
        expected_revision: 1, idempotency_key: "publish-stale")
    end
  end

  test "schedule publication batches employment locks" do
    draft = Clinic::Workforce::ScheduleDraft.create!(practice: @practice, site: @site,
      created_by_id: @manager.membership.user_id, week_start_on: Date.new(2026, 9, 7), timezone: "America/Chicago",
      status: "draft", revision: 1)
    6.times do |index|
      employment = create_employee("publish-#{index}", @practice)
      employment.update!(effective_from: Time.utc(2026, 9, 1))
      employment.employment_sites.create!(practice: @practice, site: @site, active: true,
        effective_from: Time.utc(2026, 9, 1))
      interval = Clinic::Workforce::ResolveLocalInterval.call(timezone: draft.timezone,
        local_start: "2026-09-07T09:00", local_end: "2026-09-07T17:00")
      draft.shifts.create!(practice: @practice, employment: employment, timezone: draft.timezone,
        local_start: interval[:local_start], local_end: interval[:local_end], starts_at: interval[:starts_at], ends_at: interval[:ends_at],
        start_occurrence: "only", end_occurrence: "only", break_minutes: 30)
    end
    employment_queries = []
    subscriber = ->(_name, _started, _finished, _unique_id, payload) { employment_queries << payload[:sql].to_s }

    ActiveRecord::Base.uncached do
      ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") do
        Clinic::Workforce::PublishSchedule.call(draft: draft, actor: @manager.membership.user,
          expected_revision: 1, idempotency_key: "publish-employment-batch")
      end
    end

    assert_operator employment_queries.count { |sql| sql.match?(/FROM "clinic_workforce_employments"/i) }, :<=, 3,
      employment_queries.join("\n")
  end

  test "validation blocks cross-site overlap approved time off and unavailable intervals" do
    published = draft_with_shift(@site, @employee, "2026-09-07T09:00", "2026-09-07T17:00")
    Clinic::Workforce::PublishSchedule.call(draft: published, actor: @manager.membership.user,
      expected_revision: 1, idempotency_key: "publish-main")
    overlap = draft_with_shift(@other_site, @employee, "2026-09-07T16:00", "2026-09-07T20:00")
    result = Clinic::Workforce::ValidateSchedule.call(draft: overlap)
    assert result.errors.any? { |message| message.include?("another site") }

    Clinic::Workforce::TimeOffRequest.create!(practice: @practice, site: @other_site, employment: @target,
      requested_by_id: @target.membership.user_id, public_id: SecureRandom.uuid, status: "approved",
      timezone: "America/Chicago", reason: "Personal time", starts_at: Time.iso8601("2026-09-08T14:00:00Z"),
      ends_at: Time.iso8601("2026-09-08T22:00:00Z"), submitted_at: Time.current, decided_at: Time.current,
      revision: 1, idempotency_key: "time-off", request_digest: "a" * 64)
    time_off_draft = draft_with_shift(@other_site, @target, "2026-09-08T09:00", "2026-09-08T17:00")
    assert Clinic::Workforce::ValidateSchedule.call(draft: time_off_draft).errors.any? { |message| message.include?("time off") }
  end

  test "schedule validation batches employee eligibility associations" do
    draft = Clinic::Workforce::ScheduleDraft.create!(practice: @practice, site: @site,
      created_by_id: @manager.membership.user_id, week_start_on: Date.new(2026, 9, 7), timezone: "America/Chicago",
      status: "draft", revision: 1)
    6.times do |index|
      employment = create_employee("validation-#{index}", @practice)
      employment.update!(effective_from: Time.utc(2026, 9, 1))
      employment.employment_sites.create!(practice: @practice, site: @site, active: true,
        effective_from: Time.utc(2026, 9, 1))
      interval = Clinic::Workforce::ResolveLocalInterval.call(timezone: draft.timezone,
        local_start: "2026-09-07T09:00", local_end: "2026-09-07T17:00")
      draft.shifts.create!(practice: @practice, employment: employment, timezone: draft.timezone,
        local_start: interval[:local_start], local_end: interval[:local_end], starts_at: interval[:starts_at], ends_at: interval[:ends_at],
        start_occurrence: "only", end_occurrence: "only", break_minutes: 30)
    end
    employment_site_queries = []
    subscriber = ->(_name, _started, _finished, _unique_id, payload) { employment_site_queries << payload[:sql].to_s }

    ActiveRecord::Base.uncached do
      ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") do
        assert_predicate Clinic::Workforce::ValidateSchedule.call(draft: draft), :valid?
      end
    end

    assert_equal 1, employment_site_queries.count { |sql| sql.match?(/FROM "clinic_workforce_employment_sites"/i) },
      employment_site_queries.join("\n")
  end

  test "swap cannot be manager approved before target consent and approval publishes a successor" do
    draft = draft_with_shift(@site, @employee, "2026-09-07T09:00", "2026-09-07T17:00")
    publication = Clinic::Workforce::PublishSchedule.call(draft: draft, actor: @manager.membership.user,
      expected_revision: 1, idempotency_key: "publish-swap-source")
    request = Clinic::Workforce::ShiftSwapRequest.create!(practice: @practice, site: @site,
      requester_employment: @employee, target_employment: @target, requested_by_id: @employee.membership.user_id,
      schedule_publication: publication, offered_shift_public_id: publication.shift_snapshot.first.fetch("id"),
      status: "submitted", reason: "Trade requested", submitted_at: Time.current, revision: 1,
      idempotency_key: "swap-request", request_digest: "b" * 64)

    assert_raises(ArgumentError) do
      Clinic::Workforce::DecideWorkforceRequest.call(request: request, decision: "manager_approve",
        actor: @manager.membership.user, access: AccessStub.new(nil, true), expected_revision: 1,
        idempotency_key: "early-approval")
    end
    Clinic::Workforce::DecideWorkforceRequest.call(request: request, decision: "target_accept",
      actor: @target.membership.user, access: AccessStub.new(@target, false), expected_revision: 1,
      idempotency_key: "target-consent")
    result = Clinic::Workforce::DecideWorkforceRequest.call(request: request.reload, decision: "manager_approve",
      actor: @manager.membership.user, access: AccessStub.new(nil, true), expected_revision: 2,
      idempotency_key: "manager-approval")
    assert_equal "approved", result.request.status
    assert_equal @target.id.to_s, result.publication.shift_snapshot.first.fetch("employment_id").to_s
    assert_equal publication.id, result.publication.supersedes_id
  end

  test "tenant mismatch and disabled request flags fail closed" do
    foreign = Clinic::Practice.create!(name: "Foreign workforce practice")
    foreign_site = foreign.sites.create!(code: "OTHER", name: "Other site", status: "active")
    draft = Clinic::Workforce::ScheduleDraft.new(practice: @practice, site: foreign_site,
      created_by_id: @manager.membership.user_id, week_start_on: Date.new(2026, 9, 7), timezone: "UTC", status: "draft")
    assert_not draft.valid?
    assert_equal false, settings.fetch("availability_editing_enabled")
    assert_equal false, settings.fetch("time_off_enabled")
    assert_equal false, settings.fetch("shift_swaps_enabled")
  end

  private

  def create_employee(label, practice)
    user = User.create!(email_address: "#{label}-#{SecureRandom.hex(4)}@example.invalid", password: SecureRandom.hex(18))
    membership = Clinic::Membership.create!(practice: practice, user: user)
    staff = Clinic::Staff::Member.create!(practice: practice, display_name: label.capitalize, job_title: "Team member")
    Clinic::Workforce::Employment.create!(practice: practice, staff_member: staff, membership: membership,
      status: "active", effective_from: 1.day.ago)
  end

  def draft_with_shift(site, employment, local_start, local_end)
    draft = Clinic::Workforce::ScheduleDraft.create!(practice: @practice, site: site,
      created_by_id: @manager.membership.user_id, week_start_on: Date.new(2026, 9, 7), timezone: "America/Chicago",
      status: "draft", revision: 1)
    interval = Clinic::Workforce::ResolveLocalInterval.call(timezone: draft.timezone, local_start: local_start, local_end: local_end)
    draft.shifts.create!(practice: @practice, employment: employment, timezone: draft.timezone,
      local_start: interval[:local_start], local_end: interval[:local_end], starts_at: interval[:starts_at], ends_at: interval[:ends_at],
      start_occurrence: "only", end_occurrence: "only", break_minutes: 30)
    draft
  end

  def settings
    {
      "timezone" => "America/Chicago", "workweek_start_day" => 1, "workweek_start_time" => "00:00",
      "kiosk_enabled" => false, "scanner_enabled" => false, "camera_enabled" => false,
      "manual_badge_entry_enabled" => false, "pin_required" => false, "break_tracking_enabled" => false,
      "schedule_enabled" => true, "employee_self_service_enabled" => true,
      "availability_editing_enabled" => false, "time_off_enabled" => false, "shift_swaps_enabled" => false,
      "availability_approval_required" => true, "time_off_approval_required" => true, "shift_swap_approval_required" => true,
      "payroll_export_enabled" => false, "break_duration_minutes" => nil, "break_reminder_minutes" => nil,
      "rounding_increment_minutes" => nil, "daily_overtime_threshold_minutes" => nil,
      "weekly_overtime_threshold_minutes" => nil, "break_mode" => "unconfigured", "break_paid" => nil,
      "rounding_mode" => "unconfigured", "overtime_precedence" => "unconfigured", "approval_mode" => "unconfigured",
      "pay_cadence" => "unconfigured", "payroll_provider" => "unconfigured", "provider_mapping" => {}
    }
  end
end
