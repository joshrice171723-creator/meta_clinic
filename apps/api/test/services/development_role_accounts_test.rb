require "test_helper"

class DevelopmentRoleAccountsTest < ActiveSupport::TestCase
  def local_mode
    previous_environment, previous_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
    yield
  ensure
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = previous_environment, previous_flag
  end

  test "prepares one named least-privilege account for each clinic role" do
    local_mode do
      accounts = Development::RoleAccounts.prepare!

      assert_equal Development::RoleAccounts::ACCOUNTS.keys.sort, accounts.keys.sort
      assert_equal "active", accounts.fetch("clinic-administrator").clinic_membership.practice.sites
        .find_by!(code: Development::PilotRehearsal::SITE_CODE).status
      Development::RoleAccounts::ACCOUNTS.each do |role_code, definition|
        user = accounts.fetch(role_code)
        membership = user.clinic_membership
        assert user.active?
        assert membership.active?
        assert_equal [ role_code ], membership.role_grants.active.joins(:role_version)
          .pluck("role_versions.role_code")
        assert_equal definition.fetch(:label), Development::TestAccounts.send(:role_label, role_code)
        assert_equal definition.fetch(:label), Development::TestAccounts.preview_accounts
          .find { |account| account.fetch(:id) == "employee-#{user.id}" }
          .fetch(:label)
      end
    end
  end

  test "prepares one shared workflow-ready visit without replacing recorded progress" do
    local_mode do
      accounts = Development::RoleAccounts.prepare!
      practice = accounts.fetch("clinical-staff").clinic_membership.practice
      patient = practice.patients.find_by!(reference: Development::PilotRehearsal::PATIENT_REFERENCE)
      encounter = practice.encounters.open.find_by!(patient: patient)

      assert_equal "Medication follow-up and fatigue review", encounter.appointment.reason
      assert_equal Development::PilotRehearsal::SITE_CODE, encounter.site.code
      clinician = accounts.fetch("clinician").clinic_membership.clinician_profile
      assert_equal "Clinician", clinician.display_name
      assert clinician.assignments.current.exists?(site: encounter.site)
      assert_equal %w[allergies care_needs medications], encounter.history_reviews.pluck(:topic).sort
      assert_equal %w[none_reported], encounter.history_reviews.distinct.pluck(:outcome)
      assert_equal 7, encounter.observations.count
      assert_equal %w[vital-diastolic-bp vital-heart-rate vital-systolic-bp vital-temperature vital-weight],
        encounter.observations.where(value_kind: "numeric").order(:code).pluck(:code)

      recorded = Clinic::ClinicalTask.create!(
        practice: practice,
        patient: patient,
        encounter: encounter,
        task_kind: "patient_call",
        pool_code: "clinical",
        state: "open",
        source_type: "manual",
        version: 1,
        recorded_by_membership: accounts.fetch("clinical-staff").clinic_membership
      )
      assert_no_difference [ "Clinic::Encounter.count", "Clinic::Care::Observation.count",
        "Clinic::Care::PatientHistoryReview.count", "Clinic::ClinicalTask.count" ] do
        Development::RoleAccounts.prepare!
      end
      assert_equal recorded, Clinic::ClinicalTask.find(recorded.id)
      assert accounts.fetch("clinician").clinic_membership.clinician_profile.assignments.current.exists?(site: encounter.site)
    end
  end

  test "clinic administrator can delegate payroll without receiving scribe access" do
    permissions = Development::RoleAccounts::ACCOUNTS.fetch("clinic-administrator").fetch(:permissions)

    assert_includes permissions, "telehealth.read"
    assert_includes permissions, "workforce.schedule.manage"
    assert_includes permissions, "subscription_catalog.publish"
    assert_includes permissions, "reminders.write"
    assert_includes permissions, "workforce.payroll.configure"
    assert_includes permissions, "workforce.payroll.export"
    assert_not_includes permissions, "scribe.read"
  end

  test "implementation specialist is clinic scoped without patient or administrator access" do
    definition = Development::RoleAccounts::ACCOUNTS.fetch("implementation-specialist")
    assert_equal %w[facilities.read facilities.write], definition.fetch(:permissions)
    assert_equal false, definition.fetch(:admin)

    local_mode do
      specialist = Development::RoleAccounts.prepare!.fetch("implementation-specialist")
      practice = specialist.clinic_membership.practice

      assert Clinic::Authorization.allowed?(actor: specialist, practice: practice, action: "facilities.read")
      assert Clinic::Authorization.allowed?(actor: specialist, practice: practice, action: "facilities.write")
      assert_not Clinic::Authorization.allowed?(actor: specialist, practice: practice, action: "patients.read")
      assert_not Clinic::Authorization.allowed?(actor: specialist, practice: practice, action: "roles.manage")
      assert_not specialist.admin?
    end
  end

  test "clinic administrator upgrades granted access through a new role version" do
    local_mode do
      administrator = Development::RoleAccounts.prepare!.fetch("clinic-administrator")
      original_role = administrator.clinic_membership.role_grants.active.sole.role_version
      assert_equal Clinic::Authorization::PilotRoleCatalog::VERSION, original_role.version

      original_role.role_grants.first.update!(revoked_at: Time.current)
      previous = RoleVersion.create!(role_code: "clinic-administrator", version: 1)
      previous_permission = Permission.find_or_create_by!(action_code: "patients.read")
      RoleVersionPermission.create!(role_version: previous, permission: previous_permission)
      administrator.clinic_membership.role_grants.create!(practice: administrator.clinic_membership.practice,
        role_version: previous, scope_kind: "practice", effective_from: Time.current, revision: 1)

      Development::RoleAccounts.prepare!

      grants = administrator.clinic_membership.role_grants.where(scope_kind: "practice")
      assert grants.find_by!(role_version: previous).revoked_at
      assert_nil grants.find_by!(role_version: original_role).revoked_at
    end
  end

  test "every normal role has an allowed action and a denied action" do
    expected_policy = {
      "clinic-administrator" => [ "roles.manage", "scribe.read" ],
      "implementation-specialist" => [ "facilities.write", "patients.read" ],
      "billing-accounting" => [ "billing.payment_record", "inventory.adjust" ],
      "front-desk-coordinator" => [ "appointments.book", "notes.write" ],
      "clinician" => [ "notes.write", "billing.invoice_post" ],
      "clinical-staff" => [ "encounters.write", "notes.sign" ],
      "inventory-coordinator" => [ "inventory.adjust", "patients.read" ],
      "records-viewer" => [ "notes.read", "notes.write" ],
      "payroll-operator" => [ "workforce.payroll.export", "patients.read" ]
    }

    local_mode do
      accounts = Development::RoleAccounts.prepare!
      practice = accounts.fetch("clinic-administrator").clinic_membership.practice
      expected_policy.each do |role_code, (allowed, denied)|
        actor = accounts.fetch(role_code)
        assert Clinic::Authorization.allowed?(actor: actor, practice: practice, action: allowed), role_code
        assert_not Clinic::Authorization.allowed?(actor: actor, practice: practice, action: denied), role_code
      end
    end
  end

  test "a clinician role grant is limited to its assigned location" do
    local_mode do
      accounts = Development::RoleAccounts.prepare!
      practice = accounts.fetch("clinic-administrator").clinic_membership.practice
      allowed_site = practice.sites.create!(code: "ROLE-ALLOWED")
      other_site = practice.sites.create!(code: "ROLE-OTHER")
      clinician_role = accounts.fetch("clinician").clinic_membership.role_grants.active.sole.role_version
      actor = User.create!(email_address: "role-site-clinician@example.invalid", password: SecureRandom.hex(20))
      membership = practice.memberships.create!(user: actor)
      membership.role_grants.create!(
        practice: practice,
        role_version: clinician_role,
        scope_kind: "site",
        site: allowed_site,
        effective_from: 1.minute.ago,
        revision: 1
      )

      assert Clinic::Authorization.allowed?(actor: actor, practice: practice, action: "notes.write", site: allowed_site)
      assert_not Clinic::Authorization.allowed?(actor: actor, practice: practice, action: "notes.write", site: other_site)
    end
  end

  test "retires anonymous accounts that have one grant for every permission" do
    local_mode do
      user = User.create!(email_address: "demo-#{SecureRandom.uuid}@example.invalid", password: SecureRandom.hex(32))
      membership = Development::TestClinic.create!(user)
      assert membership.active?

      Development::RoleAccounts.prepare!

      assert_not membership.reload.active?
      assert_not user.reload.active?
    end
  end
end
