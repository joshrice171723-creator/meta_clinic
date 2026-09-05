require "test_helper"

class SubscriptionPatientTest < ActiveSupport::TestCase
  test "assigned patient preparation is idempotent and leaves historical roles alone" do
    omni = User.create!(email_address: "omni@test.com", admin: true, password: SecureRandom.hex(20))
    practice = Clinic::Practice.create!(name: "Dev seed portal clinic")
    practice.memberships.create!(user: omni)
    roles_before = RoleVersion.count
    user = Development::TestAccounts.prepare_patient!
    patient = practice.patients.find_by!(reference: "SYN-OMNI-SUBSCRIPTION")
    assert_equal user.id, Development::TestAccounts.prepare_patient!.id
    assert_equal roles_before, RoleVersion.count
    assert_equal 1, practice.patients.count
    assert_equal patient.id, Clinic::PatientPortal::Identity.available.find_by!(user: user).patient_id
    user.update!(active: false)
    assert_raises(Development::TestAccounts::Unavailable) { Development::TestAccounts.prepare_patient! }
    refute user.reload.active?
  end
end
