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

  test "staging retains sample content but never enables the development shortcut or clinic routes" do
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
end
