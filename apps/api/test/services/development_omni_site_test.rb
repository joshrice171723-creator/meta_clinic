require "test_helper"

class DevelopmentOmniSiteTest < ActiveSupport::TestCase
  test "new Omni workflow location is active before booking fixtures" do
    user = Development::TestAccounts.prepare_omni!
    practice = user.clinic_membership.practice

    assert_equal "active", practice.sites.find_by!(code: "MAIN").status
    assert practice.appointments.exists?
  end

  test "workflow preparation preserves an existing inactive location" do
    user = User.create!(email_address: Development::TestAccounts::PROFILES.fetch("omni").fetch(:email),
      password: SecureRandom.hex(20))
    membership = Development::TestClinic.create!(user, permissions: [])
    site = membership.practice.sites.create!(code: "MAIN", status: "temporarily_closed")

    error = assert_raises(ArgumentError) { Development::OmniAccess.prepare!(user) }

    assert_match(/Choose an active location/, error.message)
    assert_equal "temporarily_closed", site.reload.status
    assert_not site.appointments.exists?
  end
end
