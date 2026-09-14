require "test_helper"

class ClinicScopeSwitchingTest < ActionDispatch::IntegrationTest
  setup do
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "scope-user@example.invalid", password: @password)
    @first = Development::TestClinic.create!(@user).practice
    other_user = User.create!(email_address: "scope-other@example.invalid", password: @password)
    @second = Development::TestClinic.create!(other_user).practice
    @second.update!(organization: Organization.create!(name: "Second organization"))
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "lists assigned clinics and denies a foreign clinic without changing context" do
    get "/api/clinic/context", headers: @headers
    assert_equal [ @first.id ], response.parsed_body.fetch("practices").pluck("id")
    switch_to(@second.id)
    assert_response :not_found
    get "/api/clinic/context", headers: @headers
    assert_equal @first.id, response.parsed_body.dig("practice", "id")
  end

  test "switches memberships and clears the old site while preserving permissions" do
    membership = @second.memberships.create!(user: @user, active: true)
    grant_permissions!(membership, "facilities.read")
    @second.sites.create!(code: "SECOND-A", name: "Second A")
    @second.sites.create!(code: "SECOND-B", name: "Second B")
    switch_to(@second.id)
    assert_response :success
    get "/api/clinic/context", headers: @headers
    assert_response :success
    body = response.parsed_body
    assert_equal @second.id, body.dig("practice", "id")
    assert_equal membership.id, body.fetch("membership_id")
    assert_nil body.fetch("current_site")
    assert_equal false, body.dig("capabilities", "patients_write")
    assert_equal @second.organization_id, body.fetch("practices").find { |practice| practice["id"] == @second.id }.dig("organization", "id")
    get "/api/clinic/context", headers: @headers.merge("X-Clinic-Practice" => @first.id.to_s)
    assert_response :conflict
    membership.update!(active: false)
    get "/api/clinic/context", headers: @headers
    assert_response :forbidden
  end

  test "membership uniqueness is per clinic" do
    @second.memberships.create!(user: @user, active: true)
    assert_not @second.memberships.new(user: @user, active: true).valid?
    assert_equal @first.id, @user.reload.clinic_membership.practice_id
    assert_raises ActiveRecord::RecordNotUnique do
      Clinic::Membership.transaction(requires_new: true) do
        Clinic::Membership.insert_all!([ { practice_id: @second.id, user_id: @user.id, active: true,
          created_at: Time.current, updated_at: Time.current } ])
      end
    end
    require Rails.root.join("db/migrate/20260914009000_allow_multiple_clinic_memberships")
    assert_raises(ActiveRecord::IrreversibleMigration) { AllowMultipleClinicMemberships.new.down }
  end

  test "local Omni can select another clinic without moving its original membership" do
    previous_environment = Rails.env
    previous_flag = ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env = "development"
    ENV["APP_DEVELOPMENT_LOGIN"] = "1"
    @user.update!(email_address: Development::TestAccounts::PROFILES.fetch("omni").fetch(:email),
      admin: true, password: Development::TestAccounts.send(:password_for, "omni"))
    role = RoleVersion.create!(role_code: "development-omni-administrator", version: 4)
    @user.clinic_membership.role_grants.create!(practice: @first, role_version: role,
      scope_kind: "practice", effective_from: 1.minute.ago, revision: 1)
    post "/api/development_session", params: { profile: "omni", portal: "clinic" }, headers: csrf_headers, as: :json
    assert_response :success
    get "/api/clinic/context", headers: @headers
    assert_includes response.parsed_body.fetch("practices").pluck("id"), @second.id
    switch_to(@second.id)
    assert_response :success
    get "/api/clinic/context", headers: @headers
    assert_equal @second.id, response.parsed_body.dig("practice", "id")
    assert_equal true, response.parsed_body.dig("capabilities", "patients_write")
    assert_equal @first.id, @user.reload.clinic_membership.practice_id
    assert_equal 2, @user.clinic_memberships.count
    switch_to(@first.id)
    switch_to(@second.id)
    assert_response :success
    assert_equal 2, @user.clinic_memberships.count
  ensure
    Rails.env = previous_environment
    ENV["APP_DEVELOPMENT_LOGIN"] = previous_flag
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def switch_to(practice_id)
    patch "/api/clinic/context", params: { practice_id: practice_id }, headers: csrf_headers, as: :json
  end
end
