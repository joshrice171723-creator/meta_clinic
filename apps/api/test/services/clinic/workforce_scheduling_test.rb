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
        employment.employment_sites.create!(practice: @practice, site: site, active: true,
          effective_from: Time.utc(2026, 1, 1))
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

  test "swap copies recover repeated-hour occurrences from legacy publication instants" do
    operation = Clinic::Workforce::DecideWorkforceRequest.allocate
    row = { "timezone" => "America/Chicago", "local_start" => "2026-11-01T01:30",
      "starts_at" => "2026-11-01T07:30:00Z", "local_end" => "2026-11-01T03:00", "ends_at" => "2026-11-01T09:00:00Z" }
    assert_equal "second", operation.send(:snapshot_occurrence, row, "start")
    assert_equal "only", operation.send(:snapshot_occurrence, row, "end")
    assert_equal "first", operation.send(:snapshot_occurrence, row.merge("starts_at" => "2026-11-01T06:30:00Z"), "start")
    assert_raises(ArgumentError) do
      operation.send(:snapshot_occurrence, row.merge("starts_at" => "2026-11-01T08:30:00Z"), "start")
    end
  end

  test "effective workforce settings batch site versions" do
    site_values = settings.except("timezone", "workweek_start_day", "workweek_start_time")
      .merge("schedule_enabled" => false)
    Clinic::Workforce::SettingsVersion.create!(practice: @practice, scope_kind: "site", site: @site, revision: 1,
      effective_from: 1.hour.ago, created_by_membership: @manager.membership, values: site_values)
    setting_queries = []
    subscriber = ->(_name, _started, _finished, _unique_id, payload) { setting_queries << payload[:sql].to_s }
    result = nil

    ActiveRecord::Base.uncached do
      ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") do
        result = Clinic::Workforce::EffectiveSettings.for_sites(practice: @practice, sites: [ @site, @other_site ])
      end
    end

    assert_equal false, result.fetch(@site.id).dig(:values, "schedule_enabled")
    assert_equal true, result.fetch(@other_site.id).dig(:values, "schedule_enabled")
    assert_equal 1, setting_queries.count { |sql| sql.match?(/FROM "clinic_workforce_settings_versions"/i) }, setting_queries.join("\n")
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

  test "an empty successor clears assigned shifts while retaining publication history" do
    original_draft = draft_with_shift(@site, @employee, "2026-09-07T09:00", "2026-09-07T17:00")
    original = Clinic::Workforce::PublishSchedule.call(draft: original_draft, actor: @manager.membership.user,
      expected_revision: 1, idempotency_key: "original-week")
    empty_draft = Clinic::Workforce::ScheduleDraft.create!(practice: @practice, site: @site,
      created_by_id: @manager.membership.user_id, week_start_on: original.week_start_on, timezone: original.timezone,
      status: "draft", revision: 1)
    successor = Clinic::Workforce::PublishSchedule.call(draft: empty_draft, actor: @manager.membership.user,
      expected_revision: 1, idempotency_key: "empty-week")

    assert_empty successor.shift_snapshot
    assert_equal original.id, successor.supersedes_id
    assert_equal 2, successor.version
    assert_equal 1, original.reload.shift_snapshot.length
    assert_equal successor.id, Clinic::Workforce::PublishSchedule.call(draft: empty_draft,
      actor: @manager.membership.user, expected_revision: 1, idempotency_key: "empty-week").id
    assert_not successor.update(shift_snapshot: [{ "id" => "changed" }])
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

  test "availability validation honors prior-day overnight rules and effective-date handoffs" do
    overnight = availability_version(@employee, effective_from: Date.new(2026, 9, 7), effective_until: Date.new(2026, 9, 7),
      status: "superseded", rules: [ { "day_of_week" => 1, "available" => true, "start_time" => "22:00", "end_time" => "06:00" } ])
    early_tuesday = Clinic::Workforce::ResolveLocalInterval.call(timezone: "America/Chicago",
      local_start: "2026-09-08T01:00", local_end: "2026-09-08T03:00")
    assert overnight.available_for?(early_tuesday[:starts_at], early_tuesday[:ends_at])

    availability_version(@employee, effective_from: Date.new(2026, 9, 8), status: "approved",
      rules: [ { "day_of_week" => 2, "available" => false } ])
    blocked = draft_with_shift(@site, @employee, "2026-09-07T22:00", "2026-09-08T02:00")
    assert Clinic::Workforce::ValidateSchedule.call(draft: blocked).errors.any? { |message| message.include?("recorded availability") }

    availability_version(@target, effective_from: Date.new(2026, 9, 7), effective_until: Date.new(2026, 9, 7),
      status: "superseded", rules: [ { "day_of_week" => 1, "available" => true, "start_time" => "22:00", "end_time" => "00:00" } ])
    availability_version(@target, effective_from: Date.new(2026, 9, 8), status: "approved",
      rules: [ { "day_of_week" => 2, "available" => true, "start_time" => "00:00", "end_time" => "06:00" } ])
    allowed = draft_with_shift(@site, @target, "2026-09-07T22:00", "2026-09-08T02:00")
    refute Clinic::Workforce::ValidateSchedule.call(draft: allowed).errors.any? { |message| message.include?("recorded availability") }
  end

  test "availability validates DST occurrences and fractional civil endpoints" do
    availability = availability_version(@employee, effective_from: Date.new(2026, 11, 1), status: "approved", rules: [
      { "day_of_week" => 0, "available" => true, "start_time" => "01:30", "end_time" => "02:00" },
      { "day_of_week" => 1, "available" => true, "start_time" => "09:00", "end_time" => "09:30" }
    ])
    repeated_hour = Clinic::Workforce::ResolveLocalInterval.call(timezone: "America/Chicago",
      local_start: "2026-11-01T01:45", local_end: "2026-11-01T01:15", start_occurrence: "first", end_occurrence: "second",
      infer_overnight: false)
    refute availability.available_for?(repeated_hour[:starts_at], repeated_hour[:ends_at])

    ordinary = Clinic::Workforce::ResolveLocalInterval.call(timezone: "America/Chicago",
      local_start: "2026-11-02T09:00", local_end: "2026-11-02T09:30")
    refute availability.available_for?(ordinary[:starts_at], ordinary[:ends_at] + Rational(1, 2))
  end

  test "availability rejects duplicate weekday rules" do
    availability = Clinic::Workforce::AvailabilityVersion.new(practice: @practice, site: @site, employment: @employee,
      created_by_id: @manager.membership.user_id, timezone: "America/Chicago", status: "submitted", reason: "Duplicate weekday",
      idempotency_key: SecureRandom.uuid, request_digest: "a" * 64, effective_from: Date.new(2026, 9, 7), submitted_at: Time.current,
      revision: 1, weekly_rules: [
        { "day_of_week" => "1", "available" => false },
        { "day_of_week" => 1, "available" => true, "start_time" => "09:00", "end_time" => "17:00" }
      ])

    refute_predicate availability, :valid?
    assert_includes availability.errors[:weekly_rules], "must contain valid, non-duplicate weekday rules"
  end

  test "availability selection prefers the approved same-date replacement over higher revisions" do
    approved_older_id = availability_version(@employee, effective_from: Date.new(2026, 9, 7), status: "approved", revision: 2,
      decided_at: Time.utc(2026, 9, 7, 13), rules: [ { "day_of_week" => 1, "available" => true, "start_time" => "09:00", "end_time" => "17:00" } ])
    superseded_higher_revision = availability_version(@employee, effective_from: Date.new(2026, 9, 7), status: "superseded", revision: 9,
      decided_at: Time.utc(2026, 9, 7, 12), rules: [ { "day_of_week" => 1, "available" => false } ])

    selected = Clinic::Workforce::ValidateSchedule.new(nil).send(:availability_for,
      [ approved_older_id, superseded_higher_revision ], Time.utc(2026, 9, 7, 15))
    assert_equal approved_older_id.id, selected.id
  end

  test "facility hours warnings respect closed dates and overnight boundaries without blocking publication" do
    @site.operating_hours.create!(practice: @practice, day_of_week: 1, open_time: "09:00", close_time: "17:00", closed: false)
    ordinary = draft_with_shift(@site, @employee, "2026-09-07T10:00", "2026-09-07T12:00")
    assert_empty Clinic::Workforce::ValidateSchedule.call(draft: ordinary).warnings

    overnight = draft_with_shift(@site, @employee, "2026-09-07T16:00", "2026-09-08T09:00")
    assert Clinic::Workforce::ValidateSchedule.call(draft: overnight).warnings.any? { |message| message.include?("facility operating hours") }

    @site.hour_exceptions.create!(practice: @practice, date: Date.new(2026, 9, 7), closed: true)
    closed_date = Clinic::Workforce::ValidateSchedule.call(draft: ordinary)
    assert_predicate closed_date, :valid?
    assert closed_date.warnings.any? { |message| message.include?("facility operating hours") }
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

  test "expired swap cannot be accepted but target can decline without losing request" do
    request = expiring_swap(Current.business_time)
    before_snapshot = request.schedule_publication.shift_snapshot.deep_dup
    error = assert_raises(ArgumentError) do
      decide_expiring_swap(request, "target_accept", @target, 1, "expired-accept")
    end
    assert_includes error.message, "expired"
    assert_equal "submitted", request.reload.status
    assert_empty request.decision_receipts
    assert_equal before_snapshot, request.schedule_publication.reload.shift_snapshot
    assert_equal 1, Clinic::Workforce::SchedulePublication.where(practice: @practice).count

    declined = decide_expiring_swap(request, "target_decline", @target, 1, "expired-decline")
    assert_equal "declined", declined.request.status
  end

  test "expiry blocks new approval while preserving exact consent replay and manager denial" do
    expires_at = Current.business_time + 1.hour
    request = expiring_swap(expires_at)
    consent = decide_expiring_swap(request, "target_accept", @target, 1, "consent")
    assert_equal "accepted", consent.request.status
    travel_to(expires_at) do
      replay = decide_expiring_swap(request.reload, "target_accept", @target, 1, "consent")
      assert replay.replayed
      assert_equal "accepted", replay.request.status
      assert_raises(ArgumentError) do
        decide_expiring_swap(request.reload, "manager_approve", @manager, 2, "expired-approve")
      end
      assert_equal "accepted", request.reload.status
      assert_equal 1, Clinic::Workforce::SchedulePublication.where(practice: @practice).count
      denied = decide_expiring_swap(request, "manager_deny", @manager, 2, "expired-deny")
      assert_equal "denied", denied.request.status
    end
  end

  private

  def expiring_swap(expires_at)
    draft = draft_with_shift(@site, @employee, "2026-09-07T09:00", "2026-09-07T17:00")
    publication = Clinic::Workforce::PublishSchedule.call(draft: draft, actor: @manager.membership.user,
      expected_revision: 1, idempotency_key: SecureRandom.uuid)
    Clinic::Workforce::ShiftSwapRequest.create!(practice: @practice, site: @site,
      requester_employment: @employee, target_employment: @target, requested_by_id: @employee.membership.user_id,
      schedule_publication: publication, offered_shift_public_id: publication.shift_snapshot.first.fetch("id"),
      status: "submitted", reason: "Synthetic trade requested", submitted_at: Current.business_time, revision: 1,
      expires_at: expires_at, idempotency_key: SecureRandom.uuid, request_digest: "b" * 64)
  end

  def decide_expiring_swap(request, decision, employee, revision, key)
    Clinic::Workforce::DecideWorkforceRequest.call(request: request, decision: decision,
      actor: employee.membership.user, access: AccessStub.new(employee, employee == @manager),
      expected_revision: revision, idempotency_key: key)
  end

  def create_employee(label, practice)
    user = User.create!(email_address: "#{label}-#{SecureRandom.hex(4)}@example.invalid", password: SecureRandom.hex(18))
    membership = Clinic::Membership.create!(practice: practice, user: user)
    staff = Clinic::Staff::Member.create!(practice: practice, display_name: label.capitalize, job_title: "Team member")
    Clinic::Workforce::Employment.create!(practice: practice, staff_member: staff, membership: membership,
      status: "active", effective_from: Time.utc(2026, 1, 1))
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

  def availability_version(employment, effective_from:, status:, rules:, effective_until: nil, revision: 1, decided_at: nil)
    Clinic::Workforce::AvailabilityVersion.create!(practice: @practice, site: @site, employment: employment,
      created_by_id: @manager.membership.user_id, public_id: SecureRandom.uuid, timezone: "America/Chicago", status: status,
      reason: "Synthetic schedule availability", idempotency_key: SecureRandom.uuid, request_digest: "a" * 64,
      weekly_rules: rules, effective_from: effective_from, effective_until: effective_until, submitted_at: Time.current,
      decided_at: decided_at, revision: revision)
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
