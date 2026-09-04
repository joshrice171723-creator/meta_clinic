require "test_helper"

class ProductionDemoTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    @password = SecureRandom.hex(20)
    @user = User.create!(email_address: "release@example.invalid", password: @password)
    @document = Launch::Paperwork.assign_demo!(@user)
    @sample = Launch::Material.create!(title: "Synthetic sample", body: "Example", sample: true, published_at: Time.current)
  end

  def deployed(environment)
    previous = [ Rails.env, ENV["APP_DEPLOYMENT_ENV"], ENV["APP_DEVELOPMENT_LOGIN"] ]
    Rails.env = "production"
    ENV["APP_DEPLOYMENT_ENV"] = environment
    ENV["APP_DEVELOPMENT_LOGIN"] = "1"
    yield
  ensure
    Rails.env, ENV["APP_DEPLOYMENT_ENV"], ENV["APP_DEVELOPMENT_LOGIN"] = previous
  end

  def csrf
    get "/api/csrf"
    { "X-CSRF-Token" => response.parsed_body.fetch("csrf_token"), "Origin" => "http://www.example.com" }
  end

  def sign_in
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf, as: :json
    assert_response :success
  end

  test "production hides existing samples and denies direct reads and writes without deleting history" do
    sign_in
    [ nil, "production", "misspelled" ].each do |environment|
      deployed(environment) do
        get "/api/session"
        assert_response :success
        get "/api/paperworks"
        assert_empty response.parsed_body.fetch("paperworks")
        get "/api/materials"
        assert_empty response.parsed_body.fetch("materials")
        [ "/api/paperworks/#{@document.id}", "/paperwork/#{@document.id}",
          "/api/materials/#{@sample.id}", "/training/#{@sample.id}" ].each do |path|
          get path
          assert_response :not_found
        end
        post "/api/paperworks/#{@document.id}/start", headers: csrf, as: :json
        assert_response :not_found
        post "/api/paperworks/#{@document.id}/sign", params: { consent: true, password: @password }, headers: csrf, as: :json
        assert_response :not_found
        assert_raises(Launch::Paperwork::SigningConflict) { Launch::Paperwork.assign_demo!(@user) }
        assert_no_difference "Launch::Material.count" do
          load Rails.root.join("db/seeds.rb")
        end
      end
    end
    assert_nil @document.reload.started_at
    assert_equal 1, @user.paperworks.count
  end

  test "staging retains samples but clinic routes remain denied to ordinary accounts" do
    sign_in
    deployed("staging") do
      get "/api/paperworks"
      assert_equal [ @document.id ], response.parsed_body.fetch("paperworks").pluck("id")
      get "/api/materials"
      assert_equal [ @sample.id ], response.parsed_body.fetch("materials").pluck("id")
      post "/api/development_session", headers: csrf, as: :json
      assert_response :not_found
      get "/api/clinic"
      assert_response :not_found
    end
  end

  test "only the managed staging demo identity receives the synthetic clinic workspace" do
    demo = User.create!(email_address: Staging::DemoClinic::EMAIL, password: @password)
    deployed("staging") do
      assert_difference "RoleVersion.count", 1 do
        assert_difference "RoleVersionPermission.count", Staging::DemoClinic::PERMISSIONS.length do
          assert_no_difference [ "Clinic::Practice.count", "Clinic::Membership.count" ] do
            load Rails.root.join("db/seeds.rb")
          end
        end
      end
      membership = Staging::DemoClinic.prepare!(demo)
      assert_equal Staging::DemoClinic::PRACTICE_NAME, membership.practice.name
      assert_equal 4, membership.practice.patients.count
      assert_equal 3, membership.practice.items.count
      assert_equal 2, membership.practice.staff_members.count
      assert_not demo.admin?

      post "/api/session", params: { email_address: demo.email_address, password: @password }, headers: csrf, as: :json
      assert_response :success
      get "/api/csrf"
      assert_equal true, response.parsed_body.fetch("clinic_available")
      get "/api/clinic/context"
      assert_response :success
      capabilities = response.parsed_body.fetch("capabilities")
      assert capabilities.except("billing_cash_reconcile").values.all?
      assert_equal false, capabilities.fetch("billing_cash_reconcile")
      get "/api/inquiries"
      assert_response :forbidden
      assert_difference "Clinic::Care::Patient.count", 1 do
        post "/api/clinic/patients", params: { clinic_patient: {
          display_name: "Changed During Demo [Synthetic]", reference: "DEMO-NEW"
        } }, headers: csrf, as: :json
        assert_response :created
      end

      assert_no_difference [ "Clinic::Practice.count", "Clinic::Membership.count", "Clinic::Care::Patient.count",
                             "RoleVersion.count", "Permission.count", "RoleVersionPermission.count" ] do
        assert_equal membership, Staging::DemoClinic.prepare!(demo)
      end
    end
  end

  test "production and identity collisions refuse the managed staging demo" do
    demo = User.create!(email_address: Staging::DemoClinic::EMAIL, password: @password)
    deployed("production") do
      assert_raises(Staging::DemoClinic::Unavailable) { Staging::DemoClinic.seed_authorization! }
      assert_raises(Staging::DemoClinic::Unavailable) { Staging::DemoClinic.prepare!(demo) }
      post "/api/session", params: { email_address: demo.email_address, password: @password }, headers: csrf, as: :json
      get "/api/csrf"
      assert_equal false, response.parsed_body.fetch("clinic_available")
      get "/api/clinic"
      assert_response :not_found
    end

    deployed("staging") do
      Staging::DemoClinic.seed_authorization!
      other = Clinic::Practice.create!(name: "Unmanaged collision")
      Clinic::Membership.create!(practice: other, user: demo)
      assert_raises(Staging::DemoClinic::Unavailable) { Staging::DemoClinic.prepare!(demo) }
      get "/api/clinic"
      assert_response :not_found
    end
  end

  test "provisioning refuses revoked authority instead of repairing it" do
    demo = User.create!(email_address: Staging::DemoClinic::EMAIL, password: @password)
    deployed("staging") do
      Staging::DemoClinic.seed_authorization!
      membership = Staging::DemoClinic.prepare!(demo)
      grant = membership.role_grants.sole
      grant.update!(effective_until: 1.minute.ago)
      assert_raises(Staging::DemoClinic::Unavailable) { Staging::DemoClinic.prepare!(demo) }
    end
  end

  test "provisioning refuses a preexisting expanded role" do
    demo = User.create!(email_address: Staging::DemoClinic::EMAIL, password: @password)
    deployed("staging") do
      role = RoleVersion.create!(role_code: Staging::DemoClinic::ROLE_CODE, version: 1)
      extra = Permission.create!(action_code: "synthetic.unmanaged")
      RoleVersionPermission.create!(role_version: role, permission: extra)
      assert_raises(Staging::DemoClinic::Unavailable) { Staging::DemoClinic.seed_authorization! }
      assert_raises(Staging::DemoClinic::Unavailable) { Staging::DemoClinic.prepare!(demo) }
      assert_nil demo.reload.clinic_membership
    end
  end

  test "runtime provisioning refuses a missing release-controlled administrator role" do
    demo = User.create!(email_address: Staging::DemoClinic::EMAIL, password: @password)
    deployed("staging") do
      assert_raises(Staging::DemoClinic::Unavailable) { Staging::DemoClinic.prepare!(demo) }
      assert_nil demo.reload.clinic_membership
    end
  end
end
