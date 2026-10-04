require "test_helper"

class WorkforceFoundationTest < ActiveSupport::TestCase
  setup do
    Clinic::Authorization::PilotRoleCatalog.install!
    @practice = Clinic::Practice.create!(name: "Workforce Foundation Clinic", timezone: "UTC")
    @manager = User.create!(email_address: "manager-#{SecureRandom.hex(6)}@example.com",
      password: "Manager-password-123!", active: true)
    @manager_membership = Clinic::Membership.create!(practice: @practice, user: @manager)
    grant_permissions!(@manager_membership, "roles.manage", "workforce.admin", "workforce.settings")
    @employee = User.create!(email_address: "employee-#{SecureRandom.hex(6)}@example.com",
      password: "Employee-password-123!", active: true)
    @employee_membership = Clinic::Membership.create!(practice: @practice, user: @employee)
    @staff_member = Clinic::Staff::Member.create!(practice: @practice,
      display_name: "Taylor Morgan", job_title: "Clinic coordinator", active: true)
    @site = Clinic::Site.create!(practice: @practice, code: "MAIN", name: "Main clinic", status: "active")
  end

  test "employment binds one same-practice directory record, membership, and active site" do
    employment = Clinic::Workforce::LinkEmployment.call(practice: @practice,
      staff_member: @staff_member, membership: @employee_membership, site_ids: [ @site.id ],
      effective_from: 1.minute.ago, actor: @manager)

    assert employment.active_for_work?
    assert employment.eligible_site?(@site)
    assert_equal [ "workforce-employee" ],
      @employee_membership.role_grants.active.includes(:role_version).map { |grant| grant.role_version.role_code }
    assert_equal employment, Clinic::Workforce::Access.new(actor: @employee, practice: @practice).own_employment

    employment.update!(status: :inactive)
    assert_not employment.active_for_work?
    assert @employee.reload.active?, "workforce inactivation must not mutate the global account"
    assert @employee_membership.reload.active?, "workforce inactivation must not mutate clinic membership"
  end

  test "app date cannot activate or restore workforce authorization grants" do
    grant = permission_grant!(@manager_membership, "workforce.admin")

    Current.business_date = 1.day.ago.to_date
    assert Clinic::Workforce::Access.new(actor: @manager, practice: @practice).allow?("workforce.admin")

    grant.update!(effective_from: 3.days.ago, effective_until: 1.day.ago)
    Current.business_date = 2.days.ago.to_date
    assert_not Clinic::Workforce::Access.new(actor: @manager, practice: @practice).allow?("workforce.admin")
  ensure
    Current.reset
  end

  test "batched access revision matches fresh reads and changes when grant evidence changes" do
    employment = Clinic::Workforce::LinkEmployment.call(practice: @practice,
      staff_member: @staff_member, membership: @employee_membership, site_ids: [ @site.id ],
      effective_from: 1.minute.ago, actor: @manager)
    grants = employment.membership.role_grants.active.to_a
    assignments = employment.employment_sites.to_a
    revision = Clinic::Workforce::EmploymentAccessRevision.call(employment)
    assert_equal revision, Clinic::Workforce::EmploymentAccessRevision.call(employment,
      role_grants: grants.reverse, employment_sites: assignments.reverse)

    grants.first.update!(revision: grants.first.revision + 1)
    refute_equal revision, Clinic::Workforce::EmploymentAccessRevision.call(employment.reload)
  end

  test "cross-practice membership cannot be linked" do
    other_practice = Clinic::Practice.create!(name: "Other Workforce Clinic", timezone: "UTC")
    other_user = User.create!(email_address: "foreign-#{SecureRandom.hex(6)}@example.com",
      password: "Foreign-password-123!", active: true)
    other_membership = Clinic::Membership.create!(practice: other_practice, user: other_user)

    assert_raises(ActiveRecord::RecordNotFound) do
      @practice.memberships.active.find(other_membership.id)
    end
    assert_no_difference("Clinic::Workforce::Employment.count") do
      assert_raises(ArgumentError) do
        Clinic::Workforce::LinkEmployment.call(practice: @practice,
          staff_member: @staff_member, membership: other_membership, site_ids: [ @site.id ],
          effective_from: Time.current, actor: @manager)
      end
    end
  end

  test "effective site settings preserve explicit false and version provenance" do
    practice_version = Clinic::Workforce::SettingsVersion.create!(practice: @practice,
      scope_kind: :practice, revision: 1, effective_from: 1.hour.ago,
      created_by_membership: @manager_membership, values: complete_settings)
    site_version = Clinic::Workforce::SettingsVersion.create!(practice: @practice,
      scope_kind: :site, site: @site, revision: 1, effective_from: 30.minutes.ago,
      created_by_membership: @manager_membership,
      values: { "kiosk_enabled" => false, "camera_enabled" => nil })

    result = Clinic::Workforce::EffectiveSettings.call(practice: @practice, site: @site)

    assert_equal false, result.dig(:values, "kiosk_enabled")
    assert_equal true, result.dig(:values, "camera_enabled"), "nil means inherit"
    assert_equal practice_version.id, result.dig(:versions, :practice, :id)
    assert_equal site_version.id, result.dig(:versions, :site, :id)
    assert_not site_version.update(revision: 2), "settings versions must be immutable"
  end

  test "employee invitation creates a fresh staff account without exposing its password" do
    invited_email = "new-employee-#{SecureRandom.hex(6)}@example.com"
    invitation = Clinic::Workforce::EmployeeOnboarding.invite!(practice: @practice,
      display_name: "Jordan Patel", job_title: "Medical assistant",
      email_address: invited_email, site_ids: [ @site.id ],
      effective_from: Time.current, actor: @manager)

    assert invitation[:token].present?
    assert_not_equal invitation[:token], invitation[:invitation].token_digest
    assert_equal "Jordan Patel", invitation[:invitation].staff_member.display_name
    result = Clinic::Workforce::EmployeeOnboarding.activate!(token: invitation[:token],
      password: "New-employee-password!", password_confirmation: "New-employee-password!")

    assert_equal invited_email, result[:user].email_address
    assert result[:employment].active_for_work?
    assert_equal invitation[:invitation].staff_member_id, result[:employment].staff_member_id
    assert_equal [ "workforce-employee" ],
      result[:employment].membership.role_grants.active.includes(:role_version)
        .map { |grant| grant.role_version.role_code }
    assert_nil invitation[:invitation].reload.token_digest
    assert_nil User.find(result[:user].id).password
  end

  test "employee creation rolls back when the manager cannot assign the selected role" do
    revoke_all_permissions!(@manager_membership)
    grant_permissions!(@manager_membership, "workforce.admin", "workforce.settings")
    badge_permission = Permission.find_or_create_by!(action_code: "workforce.badges")
    administrator_role = RoleVersion.find_or_create_by!(role_code: "workforce-administrator", version: 1)
    RoleVersionPermission.find_or_create_by!(role_version: administrator_role, permission: badge_permission)
    administrator_role = RoleVersion.includes(:permissions).find(administrator_role.id)

    assert_no_difference("Clinic::Staff::Member.count") do
      assert_no_difference("Clinic::Workforce::EmployeeInvitation.count") do
        assert_raises(Clinic::Authorization::Denied) do
          Clinic::Workforce::EmployeeOnboarding.invite!(practice: @practice,
            display_name: "Riley Chen", job_title: "Practice administrator",
            email_address: "riley-#{SecureRandom.hex(6)}@example.com",
            role_version: administrator_role, site_ids: [ @site.id ],
            effective_from: Time.current, actor: @manager)
        end
      end
    end
  end

  test "employee activation rolls back when the inviter can no longer assign roles" do
    invitation = Clinic::Workforce::EmployeeOnboarding.invite!(practice: @practice,
      display_name: "Alex Rivera", job_title: "Medical assistant",
      email_address: "alex-#{SecureRandom.hex(6)}@example.com",
      site_ids: [ @site.id ], effective_from: Time.current, actor: @manager)
    revoke_all_permissions!(@manager_membership)

    assert_no_difference([ "User.count", "Clinic::Membership.count", "Clinic::Workforce::Employment.count",
      "Clinic::RoleGrant.count" ]) do
      assert_raises(Clinic::Workforce::EmployeeOnboarding::InvalidInvitation) do
        Clinic::Workforce::EmployeeOnboarding.activate!(token: invitation[:token],
          password: "New-employee-password!", password_confirmation: "New-employee-password!")
      end
    end
    assert invitation[:invitation].reload.pending?
  end

  test "invitation refuses an email already owned by any global account" do
    assert_raises(ArgumentError) do
      Clinic::Workforce::EmployeeOnboarding.invite!(practice: @practice,
        staff_member: @staff_member, email_address: @employee.email_address,
        site_ids: [ @site.id ], effective_from: Time.current, actor: @manager)
    end
    assert_not Clinic::Workforce::EmployeeInvitation.exists?(staff_member_id: @staff_member.id)
  end

  private

  def complete_settings
    {
      "timezone" => "UTC",
      "workweek_start_day" => 1,
      "workweek_start_time" => "00:00",
      "kiosk_enabled" => true,
      "scanner_enabled" => true,
      "camera_enabled" => true,
      "manual_badge_entry_enabled" => false,
      "pin_required" => false,
      "break_tracking_enabled" => true,
      "break_mode" => "manual",
      "break_duration_minutes" => nil,
      "break_paid" => nil,
      "break_reminder_minutes" => nil,
      "rounding_mode" => "none",
      "rounding_increment_minutes" => nil,
      "daily_overtime_threshold_minutes" => nil,
      "weekly_overtime_threshold_minutes" => nil,
      "overtime_precedence" => "unconfigured",
      "approval_mode" => "manager_required",
      "schedule_enabled" => true,
      "employee_self_service_enabled" => true,
      "availability_editing_enabled" => true,
      "time_off_enabled" => true,
      "shift_swaps_enabled" => false,
      "availability_approval_required" => true,
      "time_off_approval_required" => true,
      "shift_swap_approval_required" => true,
      "payroll_export_enabled" => false,
      "pay_cadence" => "unconfigured",
      "payroll_provider" => "unconfigured",
      "provider_mapping" => {}
    }
  end
end
