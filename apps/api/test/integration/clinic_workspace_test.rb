require "test_helper"

class ClinicWorkspaceTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "clinic-test@example.invalid", password: @password)
    @membership = Development::TestClinic.create!(@user)
    @practice = @membership.practice
    @other_user = User.create!(email_address: "clinic-other@example.invalid", password: @password)
    @other = Development::TestClinic.create!(@other_user).practice
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def submit(path, params = {}, method: :post)
    public_send(method, path, params: params, headers: csrf_headers, as: :json)
  end

  test "clinic API exposes only permission scoped data and no page markup" do
    %w[/api/clinic /api/clinic/patients /api/clinic/inventory /api/clinic/staff].each do |path|
      get path, headers: @headers
      assert_response :success
      assert_equal "application/json", response.media_type
      assert_equal "no-store", response.headers["Cache-Control"]
      assert_not_includes response.body, "<html"
    end
    get "/api/clinic", headers: @headers
    assert_equal @practice.id, response.parsed_body.dig("practice", "id")
    assert_equal true, response.parsed_body.dig("capabilities", "patients_access")
  end

  test "clinic context identifies only the current membership credentials" do
    profile = @practice.clinician_profiles.create!(membership: @membership)
    profile.credentials.create!(practice: @practice, credential_type: "SYNTHETIC-NP", jurisdiction: "Synthetic",
      issuer_reference: "CURRENT", review_status: "unverified")
    foreign_profile = @other.clinician_profiles.create!(membership: @other_user.clinic_membership)
    foreign_profile.credentials.create!(practice: @other, credential_type: "FOREIGN", jurisdiction: "Synthetic",
      issuer_reference: "FOREIGN", review_status: "unverified")

    get "/api/clinic/context", headers: @headers

    assert_response :success
    assert_equal [ "SYNTHETIC-NP" ], response.parsed_body.fetch("credentials")
    assert_not_includes response.body, "FOREIGN"
  end

  test "billing dashboard is practice scoped and does not expose patient names" do
    patient = @practice.patients.first
    patient_name = patient.display_name
    invoice = Clinic::Billing::DraftInvoice.call(
      practice: @practice,
      actor: @user,
      patient: patient,
      currency: "USD",
      lines: [ { quantity: "2", unit_amount: "12.50", description_snapshot: "Synthetic billing dashboard line" } ]
    )
    Clinic::Billing::PostInvoice.call(invoice: invoice, actor: @user)
    Clinic::Billing::AllocatePayment.call(
      practice: @practice,
      actor: @user,
      patient: patient,
      invoice: invoice,
      external_event_reference: "synthetic-dashboard-payment",
      currency: "USD",
      amount: "10.00"
    )
    get "/api/clinic/billing", headers: @headers

    assert_response :success
    assert_equal "clinic-billing-v1", response.parsed_body.fetch("schema_version")
    assert_equal @practice.id, response.parsed_body.dig("practice", "id")
    assert response.parsed_body.dig("metrics", "invoice_count") >= 1
    assert_not_includes response.body, patient_name
    assert response.parsed_body.fetch("recent_invoices").all? { |invoice| invoice["total"].is_a?(String) }
    assert response.parsed_body.fetch("recent_payments").all? { |payment| payment["amount"].is_a?(String) }
    assert_equal 1, response.parsed_body.dig("metrics", "currencies", 0, "open_invoice_count")

    revoke_all_permissions!(@membership)
    get "/api/clinic/billing", headers: @headers
    assert_response :forbidden
  end

  test "login never selects creates or changes the assigned clinic" do
    submit "/api/session", {}, method: :delete
    get "/api/clinic", headers: @headers
    assert_response :unauthorized
    submit "/api/session", { email_address: @user.email_address, password: "wrong" }
    assert_response :unauthorized
    assert_no_difference [ "User.count", "Clinic::Practice.count", "Clinic::Membership.count" ] do
      submit "/api/session", { email_address: @user.email_address, password: @password, return_to: "https://example.invalid", practice_id: @other.id }
      assert_response :success
    end
    assert_equal @practice.id, @user.reload.clinic_membership.practice_id
  end

  test "a login has one clinic and setup never changes or reactivates its membership" do
    @membership.update!(active: false, patients_access: false)
    assert_no_difference [ "Clinic::Practice.count", "Clinic::Membership.count" ] do
      assert_equal @membership, Development::TestClinic.create!(@user)
    end
    assert_not @membership.reload.active?
    assert_not @membership.patients_access?
    duplicate = Clinic::Membership.new(user: @user, practice: @other)
    assert_not duplicate.valid?
    assert_includes duplicate.errors[:user_id], "has already been taken"
  end

  test "patient creation and append-only draft scoped to clinic regardless of submitted ownership" do
    get "/api/clinic/patients", headers: @headers
    assert_no_difference "Clinic::Care::Patient.count" do
      submit "/api/clinic/patients", { clinic_patient: { display_name: "Example C", reference: "DEMO-003", practice_id: @other.id } }
      assert_response :bad_request
    end
    assert_difference "Clinic::Care::Patient.count" do
      submit "/api/clinic/patients", { clinic_patient: { display_name: "Example C", reference: "DEMO-003" } }
      assert_response :created
    end
    patient = @practice.patients.find_by!(reference: "DEMO-003")
    submit "/api/clinic/patients/#{patient.id}/note", { body: "<script>fictional only</script>", practice_id: @other.id, author_id: @other_user.id }
    assert_response :success
    note = patient.notes.sole
    assert_equal @user.id, note.author_id
    assert_equal @practice.id, note.practice_id
    assert_not_includes note.ciphertext_for(:body), "fictional only"
    assert_not note.update(body: "overwrite")
    get "/api/clinic/patients/#{patient.id}", headers: @headers
    assert_response :success
    assert_equal "<script>fictional only</script>", response.parsed_body.fetch("notes").sole.fetch("body")
    foreign = @other.patients.first
    get "/api/clinic/patients/#{foreign.id}", headers: @headers
    assert_response :not_found
    assert_no_difference "Clinic::Care::Note.count" do
      submit "/api/clinic/patients/#{foreign.id}/note", { body: "Unauthorized synthetic attempt" }
      assert_response :not_found
    end
    assert_raises ActiveRecord::InvalidForeignKey do
      ApplicationRecord.transaction(requires_new: true) do
        Clinic::Care::Note.insert_all!([ { practice_id: @practice.id, patient_id: foreign.id, author_id: @user.id, body: "synthetic invalid link", created_at: Time.current, updated_at: Time.current } ])
      end
    end
  end

  test "inventory adjustment is atomic, idempotent and clinic scoped" do
    item = @practice.items.first
    original = item.quantity
    payload = { delta: "2", reason: "Synthetic receipt", request_key: SecureRandom.uuid }
    assert_difference "Clinic::Inventory::StockMovement.count", 1 do
      submit "/api/clinic/inventory/#{item.id}/adjust", payload
      assert_response :success
      submit "/api/clinic/inventory/#{item.id}/adjust", payload
      assert_response :success
    end
    assert_equal original + 2, item.reload.quantity
    submit "/api/clinic/inventory/#{item.id}/adjust", payload.merge(delta: "-9999", request_key: SecureRandom.uuid)
    assert_response :unprocessable_entity
    assert_equal original + 2, item.reload.quantity
    submit "/api/clinic/inventory/#{item.id}/adjust", payload.merge(reason: "", request_key: SecureRandom.uuid)
    assert_response :bad_request
    assert_equal original + 2, item.reload.quantity
    submit "/api/clinic/inventory/#{@other.items.first.id}/adjust", payload
    assert_response :not_found
    submit "/api/clinic/inventory", { clinic_item: { name: "Desk paper", sku: "DESK", reorder_level: 4, quantity: 100, practice_id: @other.id } }
    assert_response :bad_request
    submit "/api/clinic/inventory", { clinic_item: { name: "Desk paper", sku: "DESK", reorder_level: 4 } }
    assert_response :created
    assert_equal 0, @practice.items.find_by!(sku: "DESK").quantity
  end

  test "staff directory cannot grant access and status changes stay in clinic" do
    assert_no_difference "User.count" do
      submit "/api/clinic/staff", { clinic_staff_member: { display_name: "Morgan Example", job_title: "Coordinator", user_id: @other_user.id, admin: true, practice_id: @other.id } }
      assert_response :bad_request
      submit "/api/clinic/staff", { clinic_staff_member: { display_name: "Morgan Example", job_title: "Coordinator" } }
      assert_response :created
    end
    person = @practice.staff_members.order(:id).last
    submit "/api/clinic/staff/#{person.id}", { active: "false" }, method: :patch
    assert_response :success
    assert_not person.reload.active?
    assert @membership.reload.active?
    submit "/api/clinic/staff/#{@other.staff_members.first.id}", { active: "false" }, method: :patch
    assert_response :not_found
    assert @other.staff_members.first.active?
  end

  test "per-module capability and membership revocation enforced on every route" do
    @membership.update!(patients_access: false, inventory_access: false, staff_access: false)
    revoke_all_permissions!(@membership)
    %w[/api/clinic/patients /api/clinic/inventory /api/clinic/staff].each do |path|
      get path, headers: @headers
      assert_response :forbidden
    end
    submit "/api/clinic/patients", { clinic_patient: { display_name: "No access", reference: "NO" } }
    assert_response :forbidden
    assert_equal "denied", Clinic::AuditEvent.order(:id).last.outcome
    assert_equal "patients.write", Clinic::AuditEvent.order(:id).last.action_code
    @membership.update!(active: false)
    get "/api/clinic", headers: @headers
    assert_response :forbidden
    get "/api/session", headers: @headers
    assert_response :success
    @user.update!(admin: true)
    get "/api/clinic", headers: @headers
    assert_response :forbidden
  end

  test "sensitive patient reads create released audit events" do
    before = Clinic::AuditEvent.count
    get "/api/clinic/patients", headers: @headers
    assert_response :success

    assert_equal before + 1, Clinic::AuditEvent.count
    event = Clinic::AuditEvent.order(:id).last
    assert_equal "patients.read", event.action_code
    assert_equal "released", event.outcome
    assert_equal "user:#{@user.id}", event.actor_session_reference
  end

  test "clinic is disabled in production even for assigned administrators" do
    old_env = Rails.env
    Rails.env = "production"
    get "/api/clinic", headers: @headers
    assert_response :not_found
    submit "/api/clinic/patients", { clinic_patient: { display_name: "No production", reference: "NO" } }
    assert_response :not_found
  ensure
    Rails.env = old_env
  end
end
