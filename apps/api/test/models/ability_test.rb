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

  private
end
