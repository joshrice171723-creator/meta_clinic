require "test_helper"

class AbilityTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email_address: "ability-owner@example.invalid", password: SecureRandom.hex(20))
    @other_user = User.create!(email_address: "ability-other@example.invalid", password: SecureRandom.hex(20))
    @practice = Clinic::Practice.create!(name: "Ability Clinic", timezone: "UTC")
    @other_practice = Clinic::Practice.create!(name: "Other Ability Clinic", timezone: "UTC")
    @membership = Clinic::Membership.create!(practice: @practice, user: @user)
    @other_membership = Clinic::Membership.create!(practice: @other_practice, user: @other_user)
    @patient = Clinic::Care::Patient.create!(practice: @practice, display_name: "Synthetic Owner", reference: "ABILITY-001")
    @other_patient = Clinic::Care::Patient.create!(practice: @other_practice, display_name: "Synthetic Other", reference: "ABILITY-002")
  end

  test "grants are organization/practice scoped and legacy flags cannot authorize access" do
    @membership.update!(patients_access: true)
    assert_not Ability.new(@user, practice: @practice).can?(:read, @patient)

    grant_permissions!(@membership, "patients.read")
    ability = Ability.new(@user, practice: @practice)
    assert ability.can?(:read, @patient)
    assert ability.cannot?(:read, @other_patient)
    assert_equal [ @patient.id ], Clinic::Care::Patient.accessible_by(ability, :read).pluck(:id)
  end

  test "site grants authorize only the granted site's records" do
    site = Clinic::Site.create!(practice: @practice, code: "MAIN")
    other_site = Clinic::Site.create!(practice: @practice, code: "OTHER")
    grant_permissions!(@membership, "appointments.write", scope_kind: "site", site: site)
    own = Clinic::Appointment.new(practice: @practice, patient: @patient, site: site,
      starts_at: 1.hour.from_now, ends_at: 2.hours.from_now, status: "scheduled")
    foreign = Clinic::Appointment.new(practice: @practice, patient: @patient, site: other_site,
      starts_at: 3.hours.from_now, ends_at: 4.hours.from_now, status: "scheduled")
    ability = Ability.new(@user, practice: @practice)

    assert ability.can?(:create, own)
    assert ability.cannot?(:create, foreign)
    assert_not ability.can?(:create, @other_patient)
  end

  test "inactive membership, inactive user, expired grant, and missing permission deny" do
    grant = grant_permissions!(@membership, "patients.read", effective_from: 2.minutes.ago, effective_until: 1.minute.ago)
    assert_not Ability.new(@user, practice: @practice).can?(:read, @patient)
    @membership.update!(active: false)
    assert_not Ability.new(@user, practice: @practice).can?(:read, @patient)
    @membership.update!(active: true)
    @user.update!(active: false)
    assert_not Ability.new(@user, practice: @practice).can?(:read, @patient)
    assert_not Ability.new(@other_user, practice: @practice).can?(:read, @patient)
  end

  test "app date does not alter live authorization or resurrect inactive grants" do
    grant = grant_permissions!(@membership, "patients.read", effective_until: 1.day.from_now)
    [ Date.new(2000, 1, 1), Date.new(2100, 1, 1) ].each do |date|
      Current.business_date = date
      assert_includes @membership.role_grants.active, grant
      assert Ability.new(@user, practice: @practice).can?(:read, @patient)
      assert Clinic::Authorization.allowed?(actor: @user, practice: @practice, action: "patients.read")
      assert_equal @membership, Clinic::Authorization.authorize_with_legacy!(
        actor: @user, practice: @practice, action: "patients.read", legacy_action: "patients.write")
    end

    grant.update!(effective_from: 3.days.ago, effective_until: 1.day.ago)
    Current.business_date = 2.days.ago.to_date
    assert_not @membership.role_grants.active.exists?
    assert_not Ability.new(@user, practice: @practice).can?(:read, @patient)
    assert_not Clinic::Authorization.allowed?(actor: @user, practice: @practice, action: "patients.read")

    grant.update!(effective_from: 1.day.from_now, effective_until: nil)
    Current.business_date = 2.days.from_now.to_date
    assert_not Ability.new(@user, practice: @practice).can?(:read, @patient)
    grant.update!(effective_from: 1.day.ago, revoked_at: Time.current)
    assert_not Ability.new(@user, practice: @practice).can?(:read, @patient)
  ensure
    Current.reset
  end

  test "role checks reuse the active permission snapshot without querying grants again" do
    grant = grant_permissions!(@membership, "patients.read")
    role_code = grant.role_version.role_code
    queries = []
    subscriber = ->(_name, _started, _finished, _unique_id, payload) { queries << payload[:sql].to_s }

    ActiveRecord::Base.uncached do
      ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") do
        ability = Ability.new(@user, practice: @practice)
        assert ability.allowed_permission?("patients.read")
        assert ability.role_code_allowed?(role_code)
        assert ability.role_code_allowed?([ "missing-role", role_code ])
        assert_not ability.role_code_allowed?("missing-role")
      end
    end
    assert_equal 1, queries.count { |sql| sql.match?(/FROM "clinic_role_grants"/i) }
  end

  test "new ability snapshots exclude revoked expired and future role grants" do
    grant = grant_permissions!(@membership, "patients.read", effective_until: 1.day.from_now)
    role_code = grant.role_version.role_code
    assert Ability.new(@user, practice: @practice).role_code_allowed?(role_code)

    grant.update!(revoked_at: Time.current)
    assert_not Ability.new(@user, practice: @practice).role_code_allowed?(role_code)
    grant.update!(revoked_at: nil, effective_until: 1.minute.ago)
    assert_not Ability.new(@user, practice: @practice).role_code_allowed?(role_code)
    grant.update!(effective_from: 1.day.from_now, effective_until: nil)
    assert_not Ability.new(@user, practice: @practice).role_code_allowed?(role_code)
  end

  test "role snapshots deny inactive users memberships and other practices" do
    grant = grant_permissions!(@membership, "patients.read")
    role_code = grant.role_version.role_code
    assert Ability.new(@user, practice: @practice).role_code_allowed?(role_code)
    assert_not Ability.new(@user, practice: @other_practice).role_code_allowed?(role_code)
    assert_not Ability.new(@other_user, practice: @practice).role_code_allowed?(role_code)

    @membership.update!(active: false)
    assert_not Ability.new(@user, practice: @practice).role_code_allowed?(role_code)
    @membership.update!(active: true)
    @user.update!(active: false)
    assert_not Ability.new(@user, practice: @practice).role_code_allowed?(role_code)
  end

  private
end
