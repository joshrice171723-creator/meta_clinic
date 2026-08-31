require "test_helper"

class ClinicWorkspaceTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "clinic-test@example.invalid", password: @password)
    @membership = Clinic::DemoSetup.create!(@user)
    @practice = @membership.practice
    @other_user = User.create!(email_address: "clinic-other@example.invalid", password: @password)
    @other = Clinic::DemoSetup.create!(@other_user).practice
    get "/login", headers: @headers
    post "/login", params: { email_address: @user.email_address, password: @password, authenticity_token: csrf }, headers: @headers
    assert_redirected_to "/portal"
  end

  def csrf
    Nokogiri::HTML(response.body).at_css('meta[name="csrf-token"]')["content"]
  end

  def submit(path, params = {}, method: :post)
    get "/clinic", headers: @headers
    public_send(method, path, params: params.merge(authenticity_token: csrf), headers: @headers)
  end

  test "clinic has distinct layout and no launch navigation or marketing chrome" do
    %w[/clinic /clinic/patients /clinic/inventory /clinic/staff].each do |path|
      get path, headers: @headers
      assert_response :success
      assert_select "body.clinic-shell", count: 1
      assert_select "nav[aria-label='Clinic navigation']", count: 1
      assert_select ".site-header", count: 0
      assert_select "script", count: 0
      assert_includes response.body, "SYNTHETIC ONLY"
    end
    get "/portal", headers: @headers
    assert_select "body.clinic-shell", count: 0
    assert_select "nav[aria-label='Launch navigation']", count: 1
  end

  test "clinic login resumes directly at the assigned clinic without a selector or creation" do
    submit "/logout"
    get "/clinic", headers: @headers
    assert_redirected_to "/login"
    follow_redirect!
    post "/login", params: { email_address: @user.email_address, password: "wrong", authenticity_token: csrf }, headers: @headers
    assert_response :unauthorized
    assert_no_difference [ "User.count", "Clinic::Practice.count", "Clinic::Membership.count" ] do
      post "/login", params: { email_address: @user.email_address, password: @password, authenticity_token: csrf, return_to: "https://example.invalid", practice_id: @other.id }, headers: @headers
      assert_redirected_to "/clinic"
      follow_redirect!
      assert_response :success
      assert_select ".practice-label strong", text: "Test Clinic"
      assert_select "select", count: 0
      assert_select "form[action='/clinic/demo']", count: 0
    end
    assert_equal @practice.id, @user.reload.clinic_membership.practice_id
  end

  test "a login has one clinic and setup never changes or reactivates its membership" do
    @membership.update!(active: false, patients_access: false)
    assert_no_difference [ "Clinic::Practice.count", "Clinic::Membership.count" ] do
      assert_equal @membership, Clinic::DemoSetup.create!(@user)
    end
    assert_not @membership.reload.active?
    assert_not @membership.patients_access?
    duplicate = Clinic::Membership.new(user: @user, practice: @other)
    assert_not duplicate.valid?
    assert_includes duplicate.errors[:user_id], "has already been taken"
  end

  test "patient creation and append-only draft scoped to clinic regardless of submitted ownership" do
    assert_difference "Clinic::Patient.count" do
      submit "/clinic/patients", { clinic_patient: { display_name: "Example C", reference: "DEMO-003", practice_id: @other.id } }
      assert_response :see_other
    end
    patient = @practice.patients.find_by!(reference: "DEMO-003")
    submit "/clinic/patients/#{patient.id}/note", { body: "<script>fictional only</script>", practice_id: @other.id, author_id: @other_user.id }
    assert_response :see_other
    note = patient.notes.sole
    assert_equal @user.id, note.author_id
    assert_equal @practice.id, note.practice_id
    assert_not_includes note.ciphertext_for(:body), "fictional only"
    assert_not note.update(body: "overwrite")
    get "/clinic/patients/#{patient.id}", headers: @headers
    assert_response :success
    assert_select "script", count: 0
    assert_includes response.body, "&lt;script&gt;fictional only&lt;/script&gt;"
    foreign = @other.patients.first
    get "/clinic/patients/#{foreign.id}", headers: @headers
    assert_response :not_found
    assert_no_difference "Clinic::Note.count" do
      submit "/clinic/patients/#{foreign.id}/note", { body: "Unauthorized synthetic attempt" }
      assert_response :not_found
    end
    assert_raises ActiveRecord::InvalidForeignKey do
      Clinic::Note.insert_all!([ { practice_id: @practice.id, patient_id: foreign.id, author_id: @user.id, body: "synthetic invalid link", created_at: Time.current, updated_at: Time.current } ])
    end
  end

  test "inventory adjustment is atomic, idempotent and clinic scoped" do
    item = @practice.items.first
    original = item.quantity
    payload = { delta: "2", reason: "Synthetic receipt", request_key: SecureRandom.uuid }
    assert_difference "Clinic::StockMovement.count", 1 do
      submit "/clinic/inventory/#{item.id}/adjust", payload
      assert_response :see_other
      submit "/clinic/inventory/#{item.id}/adjust", payload
      assert_response :see_other
    end
    assert_equal original + 2, item.reload.quantity
    submit "/clinic/inventory/#{item.id}/adjust", payload.merge(delta: "-9999", request_key: SecureRandom.uuid)
    assert_response :unprocessable_entity
    assert_equal original + 2, item.reload.quantity
    submit "/clinic/inventory/#{item.id}/adjust", payload.merge(reason: "", request_key: SecureRandom.uuid)
    assert_response :unprocessable_entity
    assert_equal original + 2, item.reload.quantity
    submit "/clinic/inventory/#{@other.items.first.id}/adjust", payload
    assert_response :not_found
    submit "/clinic/inventory", { clinic_item: { name: "Desk paper", sku: "DESK", reorder_level: 4, quantity: 100, practice_id: @other.id } }
    assert_response :see_other
    assert_equal 0, @practice.items.find_by!(sku: "DESK").quantity
  end

  test "staff directory cannot grant access and status changes stay in clinic" do
    assert_no_difference "User.count" do
      submit "/clinic/staff", { clinic_staff_member: { display_name: "Morgan Example", job_title: "Coordinator", user_id: @other_user.id, admin: true, practice_id: @other.id } }
      assert_response :see_other
    end
    person = @practice.staff_members.order(:id).last
    submit "/clinic/staff/#{person.id}", { active: "false" }, method: :patch
    assert_response :see_other
    assert_not person.reload.active?
    assert @membership.reload.active?
    submit "/clinic/staff/#{@other.staff_members.first.id}", { active: "false" }, method: :patch
    assert_response :not_found
    assert @other.staff_members.first.active?
  end

  test "per-module capability and membership revocation enforced on every route" do
    @membership.update!(patients_access: false, inventory_access: false, staff_access: false)
    %w[/clinic/patients /clinic/inventory /clinic/staff].each do |path|
      get path, headers: @headers
      assert_response :forbidden
    end
    submit "/clinic/patients", { clinic_patient: { display_name: "No access", reference: "NO" } }
    assert_response :forbidden
    @membership.update!(active: false)
    get "/clinic", headers: @headers
    assert_response :forbidden
    get "/portal", headers: @headers
    assert_response :success
    @user.update!(admin: true)
    get "/clinic", headers: @headers
    assert_response :forbidden
  end

  test "clinic is disabled in production even for assigned administrators" do
    old_env = Rails.env
    Rails.env = "production"
    get "/clinic", headers: @headers
    assert_response :not_found
    submit "/clinic/patients", { clinic_patient: { display_name: "No production", reference: "NO" } }
    assert_response :not_found
  ensure
    Rails.env = old_env
  end
end
