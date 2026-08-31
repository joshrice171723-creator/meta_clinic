require "test_helper"

class RailsPagesTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "web-test@example.invalid", password: @password)
    @material = Material.create!(title: "Synthetic guide", body: "<script>not executable</script>", sample: true, published_at: Time.current)
  end

  def token(path = "/login")
    get path, headers: @headers
    assert_response :success
    Nokogiri::HTML(response.body).at_css('meta[name="csrf-token"]')["content"]
  end

  def submit(path, params = {}, from: "/login")
    post path, params: params.merge(authenticity_token: token(from)), headers: @headers
  end

  def sign_in
    submit "/login", { email_address: @user.email_address, password: @password }
    assert_redirected_to "/portal"
  end

  test "selling pages use native HTML and no scripts, signup, or clinic brief" do
    %w[/ /contact /login].each do |path|
      get path, headers: @headers
      assert_response :success
      assert_select "script", count: 0
      assert_select "link[href='/application.css']", count: 1
      assert_select "h1", count: 1
      assert_includes response.headers["Content-Security-Policy"], "script-src 'none'"
    end
    get "/", headers: @headers
    assert_select "details", count: 6
    assert_select "meta[property='og:image']", count: 1
    assert_not_includes response.body, "opened the doors"
    get "/portal", headers: @headers
    assert_redirected_to "/login"
    get "/signup", headers: @headers
    assert_response :not_found
  end

  test "navigation never creates or replaces a login and signed in accounts can open login" do
    assert_no_difference [ "User.count", "MemberSession.count", "Clinic::Practice.count" ] do
      get "/", headers: @headers
      assert_select ".site-header a[href='/login']", text: "Member login"
      get "/portal", headers: @headers
      assert_redirected_to "/login"
      get "/login", headers: @headers
      assert_response :success
    end
    sign_in
    session_ids = @user.member_sessions.pluck(:id)
    assert_no_difference [ "User.count", "MemberSession.count", "Clinic::Practice.count" ] do
      get "/", headers: @headers
      assert_select ".site-header a[href='/portal']", text: "My launch"
      get "/portal", headers: @headers
      assert_response :success
      get "/login", headers: @headers
      assert_response :success
      assert_select "form[action='/login']", count: 1
    end
    assert_equal session_ids, @user.member_sessions.pluck(:id)
    get "/clinic", headers: @headers
    assert_response :forbidden
    assert_includes response.body, "assigns one clinic to each login"
    assert_select "form[action='/clinic/demo']", count: 0
    post "/clinic/demo", params: { authenticity_token: Nokogiri::HTML(response.body).at_css('meta[name="csrf-token"]')["content"] }, headers: @headers
    assert_response :not_found
  end

  test "login, progress, escaped guides and logout work without JavaScript" do
    post "/login", params: { email_address: @user.email_address, password: @password }, headers: @headers
    assert_response :unprocessable_entity
    submit "/login", { email_address: @user.email_address, password: "wrong" }
    assert_response :unauthorized
    sign_in
    get "/portal", headers: @headers
    assert_select "a[href='/clinic']", minimum: 1
    assert_select "a[href='/paperwork']", minimum: 1
    get "/training/#{@material.id}", headers: @headers
    assert_response :success
    assert_select "script", count: 0
    assert_includes response.body, "&lt;script&gt;not executable&lt;/script&gt;"
    submit "/training/#{@material.id}/complete", {}, from: "/training/#{@material.id}"
    assert_response :not_found
    submit "/training/#{@material.id}/start", {}, from: "/training/#{@material.id}"
    assert_response :see_other
    submit "/training/#{@material.id}/complete", {}, from: "/training/#{@material.id}"
    assert_response :see_other
    assert_equal "completed", @user.learning_progresses.find_by!(material: @material).status
    submit "/logout", {}, from: "/portal"
    assert_redirected_to "/login"
    get "/portal", headers: @headers
    assert_redirected_to "/login"
    get "/materials/#{@material.id}", headers: @headers
    assert_redirected_to "/training/#{@material.id}"
  end

  test "HTML signing requires review, consent, password, version and ownership" do
    document = Paperwork.assign_demo!(@user)
    other = User.create!(email_address: "other-web@example.invalid", password: @password)
    other_doc = Paperwork.assign_demo!(other)
    sign_in
    get "/paperwork/#{other_doc.id}", headers: @headers
    assert_response :not_found
    get "/paperwork/#{other_doc.id}/receipt", headers: @headers
    assert_response :not_found
    get "/paperwork/#{document.id}/receipt", headers: @headers
    assert_response :conflict
    form = { consent: "1", password: @password, signature_name: "Alex Example", content_digest: document.content_digest }
    submit "/paperwork/#{document.id}/sign", form, from: "/paperwork/#{document.id}"
    assert_response :conflict
    submit "/paperwork/#{document.id}/start", {}, from: "/paperwork/#{document.id}"
    assert_response :see_other
    submit "/paperwork/#{document.id}/sign", form.merge(consent: "0"), from: "/paperwork/#{document.id}"
    assert_response :unprocessable_entity
    submit "/paperwork/#{document.id}/sign", form.merge(password: "wrong"), from: "/paperwork/#{document.id}"
    assert_response :unauthorized
    submit "/paperwork/#{document.id}/sign", form.merge(content_digest: "stale"), from: "/paperwork/#{document.id}"
    assert_response :conflict
    submit "/paperwork/#{document.id}/sign", form, from: "/paperwork/#{document.id}"
    assert_response :see_other
    get "/paperwork/#{document.id}/receipt", headers: @headers
    assert_response :success
    assert_includes response.headers["Content-Disposition"], "attachment"
    assert_includes response.body, "DEMONSTRATION ONLY"
    submit "/paperwork/#{document.id}/sign", form, from: "/paperwork/#{document.id}"
    assert_response :conflict
  end

  test "contact errors and encrypted persistence; inbox restricted to administrators" do
    submit "/contact", { contact_message: { name: "", email: "", message: "" } }, from: "/contact"
    assert_response :unprocessable_entity
    assert_difference "ContactMessage.count" do
      submit "/contact", { contact_message: { name: "Fictional Visitor", email: "visitor@example.invalid", message: "Synthetic business inquiry only." } }, from: "/contact"
      assert_response :see_other
    end
    message = ContactMessage.last
    assert_not_includes message.ciphertext_for(:message), "Synthetic business inquiry"
    sign_in
    get "/inquiries", headers: @headers
    assert_response :forbidden
    @user.update!(admin: true)
    get "/inquiries", headers: @headers
    assert_response :success
    assert_includes response.body, "Synthetic business inquiry only."
  end

  test "native demo navigation allows ordinary GETs but rejects missing or hostile POST origins" do
    old_env, old_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env = "development"
    ENV["APP_DEVELOPMENT_LOGIN"] = "1"
    get "/login", headers: { "REMOTE_ADDR" => "127.0.0.1" }
    assert_response :success
    assert_select "form[action='/login/development']", count: 1
    csrf = Nokogiri::HTML(response.body).at_css('meta[name="csrf-token"]')["content"]
    post "/login/development", params: { authenticity_token: csrf }, headers: { "REMOTE_ADDR" => "127.0.0.1" }
    assert_response :not_found
    submit "/login/development"
    assert_redirected_to "/portal"
    get "/portal", headers: { "REMOTE_ADDR" => "127.0.0.1" }
    assert_response :success
    assert_includes response.body, "Local development walkthrough"
    assert_select ".session-notice", text: /already signed in/
    assert_select ".session-notice form[action='/logout']", count: 1
    assert_no_difference [ "User.count", "MemberSession.count", "Clinic::Practice.count" ] do
      get "/clinic", headers: { "REMOTE_ADDR" => "127.0.0.1" }
      assert_response :success
      assert_select ".practice-label strong", text: "Test Clinic"
      assert_select "form[action='/clinic/demo']", count: 0
      get "/login", headers: { "REMOTE_ADDR" => "127.0.0.1" }
      assert_response :success
      assert_select "form[action='/login']", count: 1
    end
    ENV["APP_DEVELOPMENT_LOGIN"] = "0"
    get "/portal", headers: @headers
    assert_redirected_to "/login"
  ensure
    Rails.env = old_env
    ENV["APP_DEVELOPMENT_LOGIN"] = old_flag
  end

  test "explicit development login returns directly to the requested clinic workspace" do
    old_env, old_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env = "development"
    ENV["APP_DEVELOPMENT_LOGIN"] = "1"
    get "/clinic", headers: @headers
    assert_redirected_to "/login"
    submit "/login/development"
    assert_redirected_to "/clinic"
    follow_redirect!
    assert_response :success
    assert_select ".practice-label strong", text: "Test Clinic"
  ensure
    Rails.env = old_env
    ENV["APP_DEVELOPMENT_LOGIN"] = old_flag
  end
end
