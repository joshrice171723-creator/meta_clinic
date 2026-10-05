require "digest"

module Development
  class DemoSandboxStaffActivity
    WEEKS = 8
    SHIFTS_PER_WEEK = 2
    ACTIVITY_START = 65.days

    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      run.practice.organization.practices.order(:id).each do |practice|
        actor = run.operator_user
        membership = practice.memberships.active.find_by!(user: actor)
        window_start = Current.business_time - ACTIVITY_START
        ensure_settings!(practice:, membership:, window_start:)
        practice.sites.order(:id).each_with_index do |site, site_index|
          ensure_site_features!(practice:, site:, membership:, window_start:)
          zone = ActiveSupport::TimeZone[site.timezone_override.presence || practice.timezone] ||
            raise(ArgumentError, "Sandbox workforce timezone is unavailable")
          employments = Clinic::Workforce::Employment.where(practice:)
            .includes(:staff_member, :employment_sites, membership: :user).order(:id).select do |employment|
            employment.membership.user.email_address.start_with?("sandbox-staff-#{practice.id}-#{site_index + 1}-") &&
              employment.active_for_work?(at: Current.business_time) && employment.eligible_site?(site, at: Current.business_time)
          end
          prepare_schedules!(practice:, site:, employments:, actor:, zone:)
          prepare_leave!(practice:, site:, employment: employments.find { |item| item.staff_member.job_title == "Clinic manager" },
            actor:, membership:, zone:)
          prepare_timecard!(practice:, site:, employment: employments.find { |item| item.staff_member.job_title == "Front desk coordinator" },
            actor:, membership:)
        end
      end
      DemoSandboxWeeklySchedule.prepare!(run)
    end

    def self.ensure_settings!(practice:, membership:, window_start:)
      return if Clinic::Workforce::SettingsVersion.practice.where(practice:).effective_at(window_start).exists?

      relation = Clinic::Workforce::SettingsVersion.practice.where(practice:)
      relation.create!(revision: relation.maximum(:revision).to_i + 1, effective_from: window_start,
        created_by_membership: membership, values: {
          "timezone" => practice.timezone, "workweek_start_day" => 0, "workweek_start_time" => "00:00",
          "kiosk_enabled" => true, "scanner_enabled" => true, "camera_enabled" => false,
          "manual_badge_entry_enabled" => false, "pin_required" => false, "break_tracking_enabled" => false,
          "break_mode" => "unconfigured", "break_duration_minutes" => nil, "break_paid" => nil,
          "break_reminder_minutes" => nil, "rounding_mode" => "none", "rounding_increment_minutes" => nil,
          "daily_overtime_threshold_minutes" => 480, "weekly_overtime_threshold_minutes" => 2_400,
          "overtime_precedence" => "daily_then_weekly", "approval_mode" => "manager_required",
          "schedule_enabled" => true, "employee_self_service_enabled" => true,
          "availability_editing_enabled" => false, "time_off_enabled" => true, "shift_swaps_enabled" => false,
          "availability_approval_required" => true, "time_off_approval_required" => true,
          "shift_swap_approval_required" => true, "payroll_export_enabled" => false,
          "pay_cadence" => "unconfigured", "payroll_provider" => "unconfigured", "provider_mapping" => {}
        })
    end
    private_class_method :ensure_settings!

    def self.ensure_site_features!(practice:, site:, membership:, window_start:)
      values = Clinic::Workforce::EffectiveSettings.call(practice:, site:, at: window_start).fetch(:values)
      enabled = %w[kiosk_enabled scanner_enabled schedule_enabled employee_self_service_enabled time_off_enabled]
      missing = enabled.reject { |key| values[key] == true }
      return if missing.empty?

      relation = Clinic::Workforce::SettingsVersion.site.where(practice:, site:)
      relation.create!(revision: relation.maximum(:revision).to_i + 1, effective_from: window_start,
        created_by_membership: membership, values: missing.index_with { true })
    end
    private_class_method :ensure_site_features!

    def self.prepare_schedules!(practice:, site:, employments:, actor:, zone:)
      first_week = Current.business_time.in_time_zone(zone).to_date.beginning_of_week(:monday) - 4.weeks
      WEEKS.times do |week_index|
        week_start = first_week + week_index.weeks
        key = "sandbox-staff-activity-#{site.id}-#{week_start.iso8601}"
        next if Clinic::Workforce::SchedulePublication.exists?(practice:, idempotency_key: key)

        ApplicationRecord.transaction do
          draft = Clinic::Workforce::ScheduleDraft.find_or_create_by!(practice:, site:, week_start_on: week_start) do |record|
            record.created_by_id = actor.id
            record.timezone = zone.tzinfo.name
            record.status = "draft"
            record.revision = 1
          end
          unless draft.shifts.exists?
            SHIFTS_PER_WEEK.times do |slot|
              index = (week_index * SHIFTS_PER_WEEK + slot) % employments.length
              employment = employments.fetch(index)
              shift_date = week_start + (1 + ((week_index + slot) % 5)).days
              start_hour = slot.zero? ? 9 : 13
              interval = Clinic::Workforce::ResolveLocalInterval.call(timezone: zone.tzinfo.name,
                local_start: "#{shift_date.iso8601}T#{format('%02d', start_hour)}:00",
                local_end: "#{shift_date.iso8601}T#{format('%02d', start_hour + 4)}:00")
              draft.shifts.create!(practice:, employment:, **interval, timezone: zone.tzinfo.name,
                start_occurrence: "only", end_occurrence: "only", role_name: employment.staff_member.job_title,
                break_minutes: 0)
              draft.update!(revision: draft.revision + 1)
            end
          end
          Clinic::Workforce::PublishSchedule.call(draft:, actor:, expected_revision: draft.revision,
            idempotency_key: key)
        end
      end
    end
    private_class_method :prepare_schedules!

    def self.prepare_leave!(practice:, site:, employment:, actor:, membership:, zone:)
      raise ArgumentError, "Sandbox workforce leave needs a clinic manager" unless employment

      key = "sandbox-staff-leave-#{site.id}"
      request = Clinic::Workforce::TimeOffRequest.find_by(practice:, idempotency_key: key)
      if request && (request.site_id != site.id || request.employment_id != employment.id)
        raise ArgumentError, "Sandbox workforce leave key belongs to another employee or site"
      end
      unless request
        leave_date = Current.business_time.in_time_zone(zone).to_date + 14.days
        leave_date += (3 - leave_date.wday) % 7
        interval = Clinic::Workforce::ResolveLocalInterval.call(timezone: zone.tzinfo.name,
          local_start: "#{leave_date.iso8601}T09:00", local_end: "#{leave_date.iso8601}T17:00")
        payload = { site_id: site.id, local_start: "#{leave_date.iso8601}T09:00",
          local_end: "#{leave_date.iso8601}T17:00", timezone: zone.tzinfo.name,
          reason: "Personal time off", idempotency_key: key }
        request = Clinic::Workforce::TimeOffRequest.create!(practice:, site:, employment:,
          requested_by_id: employment.membership.user_id, starts_at: interval.fetch(:starts_at),
          ends_at: interval.fetch(:ends_at), timezone: zone.tzinfo.name,
          reason: payload.fetch(:reason), status: "submitted", submitted_at: Current.business_time,
          revision: 1, idempotency_key: key,
          request_digest: Digest::SHA256.hexdigest(JSON.generate(payload.deep_stringify_keys.sort.to_h)))
      end
      return if request.status == "approved"
      raise ArgumentError, "Sandbox workforce leave request is not reviewable" unless request.status == "submitted"

      Clinic::Workforce::DecideWorkforceRequest.call(request:, decision: "manager_approve", actor:,
        access: Clinic::Workforce::Access.new(actor:, practice:), expected_revision: request.revision,
        idempotency_key: "#{key}-decision", reason: "Coverage confirmed.")
    end
    private_class_method :prepare_leave!

    def self.prepare_timecard!(practice:, site:, employment:, actor:, membership:)
      raise ArgumentError, "Sandbox workforce timecard needs a front desk employee" unless employment

      clock_in_key = stable_uuid("sandbox-staff-activity-clock-in-#{employment.id}")
      clock_out_key = stable_uuid("sandbox-staff-activity-clock-out-#{employment.id}")
      existing = Clinic::Workforce::Punch.where(practice:, request_key: [ clock_in_key, clock_out_key ]).index_by(&:request_key)
      if existing[clock_in_key] && existing[clock_out_key]
        return calculate_timecard(practice:, employment:, membership:, at: existing.fetch(clock_in_key).occurred_at_utc)
      end
      raise ArgumentError, "Sandbox workforce clock activity is incomplete" if existing[clock_out_key]

      now = Current.business_time
      session = Clinic::Workforce::KioskSession.where(practice:, site:, status: "active")
        .where("expires_at > ?", now).order(:id).last
      unless session
        enrollment_token = SecureRandom.urlsafe_base64(32, false)
        Clinic::Workforce::KioskEnrollment.create!(practice:, site:,
          token_digest: Clinic::Workforce::IssueBadge.digest(enrollment_token), issued_by_membership: membership,
          expires_at: now + 24.hours)
        session = Clinic::Workforce::EnrollKiosk.call(enrollment_token:).kiosk_session
      end
      badge = Clinic::Workforce::IssueBadge.call(employment:, actor_membership: membership)
      clock_in_at = now - 2.hours
      unless existing[clock_in_key]
        challenge = Clinic::Workforce::ResolveBadgeChallenge.call(kiosk_session: session,
          badge_token: badge.token, input_method: "scanner", now: clock_in_at)
        Clinic::Workforce::RecordPunch.call(kiosk_session: session, challenge_token: challenge.token,
          event_type: "clock_in", request_key: clock_in_key, now: clock_in_at)
      end
      clock_out_at = Current.business_time + 1.minute
      challenge = Clinic::Workforce::ResolveBadgeChallenge.call(kiosk_session: session,
        badge_token: badge.token, input_method: "scanner", now: clock_out_at)
      Clinic::Workforce::RecordPunch.call(kiosk_session: session, challenge_token: challenge.token,
        event_type: "clock_out", request_key: clock_out_key, now: clock_out_at)
      calculate_timecard(practice:, employment:, membership:, at: clock_in_at)
    end
    private_class_method :prepare_timecard!

    def self.calculate_timecard(practice:, employment:, membership:, at:)
      period_start = Clinic::Workforce::CalculateTimecard.current_period_start(practice:, at:)
      Clinic::Workforce::CalculateTimecard.call(employment:, period_start:, actor_membership: membership)
    end
    private_class_method :calculate_timecard

    def self.stable_uuid(value)
      hex = Digest::SHA256.hexdigest(value)[0, 32]
      [ hex[0, 8], hex[8, 4], hex[12, 4], hex[16, 4], hex[20, 12] ].join("-")
    end
    private_class_method :stable_uuid
  end
end
