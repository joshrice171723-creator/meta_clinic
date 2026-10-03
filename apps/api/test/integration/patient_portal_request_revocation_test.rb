require "test_helper"
require "minitest/mock"

class PatientPortalRequestRevocationTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @practice = Clinic::Practice.create!(name: "Synthetic portal request revocation", timezone: "UTC")
    @patient = @practice.patients.create!(display_name: "Synthetic assigned portal patient", reference: "PORTAL-REVOKE")
    @portal_user = User.create!(email_address: "portal-request-revoke@example.invalid", password: @password)
    @staff = User.create!(email_address: "portal-request-revoke-staff@example.invalid", password: SecureRandom.hex(18))
    membership = @practice.memberships.create!(user: @staff)
    grant_permissions!(membership, "patient_portal.identity.revoke")
    @identity = Clinic::PatientPortal::Identity.create!(practice: @practice, patient: @patient, user: @portal_user,
      status: "active", invited_at: Time.current, activated_at: Time.current)
    post "/api/session", params: { email_address: @portal_user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "revocation after controller auth denies a new message rather than using cached access" do
    before_audits = request_audits
    assert_no_difference [ -> { Clinic::PatientPortal::Request.count }, -> { request_versions } ] do
      revoke_after_auth { submit("revoked-new", "message") }
      assert_equal 404, response.status
      refute response.parsed_body.key?("request")
    end
    assert_equal before_audits, request_audits
    assert_revoked
  end

  test "revocation after controller auth denies exact replay and leaves saved request unchanged" do
    submit("revoked-replay", "message")
    assert_response :created
    saved = Clinic::PatientPortal::Request.find(response.parsed_body.dig("request", "id"))
    evidence = saved.attributes
    before_audits = request_audits
    assert_no_difference [ -> { Clinic::PatientPortal::Request.count }, -> { request_versions } ] do
      revoke_after_auth { submit("revoked-replay", "message") }
      assert_equal 404, response.status
      refute response.parsed_body.key?("request")
    end
    assert_equal evidence, saved.reload.attributes
    assert_equal before_audits, request_audits
    assert_revoked
  end

  test "active assigned identity creates and exactly replays messages callbacks and refills" do
    %w[message callback refill].each do |kind|
      assert_difference -> { Clinic::PatientPortal::Request.count }, 1 do
        submit("active-#{kind}", kind)
        assert_response :created
        id = response.parsed_body.dig("request", "id")
        submit("active-#{kind}", kind)
        assert_equal 200, response.status
        assert_equal id, response.parsed_body.dig("request", "id")
      end
    end
  end

  test "cached revoked identity denies callback and refill writes at the domain boundary" do
    stale = Clinic::PatientPortal::Identity.find(@identity.id)
    revoke!
    assert stale.active?
    %w[callback refill].each do |kind|
      assert_no_difference -> { Clinic::PatientPortal::Request.count } do
        assert_raises(ActiveRecord::RecordNotFound) { create_request(identity: stale, actor: @portal_user, kind:) }
      end
    end
  end

  test "unique-conflict recovery rechecks access before returning saved content" do
    saved = create_request
    evidence = saved.attributes
    original_guard = Clinic::PatientPortal::RequestAccess.method(:authorize!)
    checks = 0
    guard = ->(**arguments) do
      checks += 1
      raise ActiveRecord::RecordNotFound, "Simulated current portal access denial" if checks == 2

      original_guard.call(**arguments)
    end
    original_lookup = Clinic::PatientPortal::Request.method(:find_by)
    lookups = 0
    lookup = ->(*arguments, **keywords) do
      lookups += 1
      lookups == 1 ? nil : original_lookup.call(*arguments, **keywords)
    end
    conflict = ->(**_arguments) { raise ActiveRecord::RecordNotUnique }
    assert_no_difference [ -> { Clinic::PatientPortal::Request.count }, -> { request_versions } ] do
      # Simulate the unique-insert exception; do not abort the test's outer
      # PostgreSQL transaction with an actual duplicate insert.
      Clinic::PatientPortal::Request.stub(:find_by, lookup) do
        Clinic::PatientPortal::Request.stub(:create!, conflict) do
          Clinic::PatientPortal::RequestAccess.stub(:authorize!, guard) do
            denial = assert_raises(ActiveRecord::RecordNotFound) { create_request }
            assert_equal "Simulated current portal access denial", denial.message
          end
        end
      end
    end
    assert_equal 2, checks
    assert_equal evidence, saved.reload.attributes
    assert @identity.reload.active?
  end

  test "current account and actor patient practice bindings precede request creation" do
    other_actor = User.create!(email_address: "portal-request-wrong-actor@example.invalid", password: SecureRandom.hex(18))
    other_patient = @practice.patients.create!(display_name: "Synthetic unrelated portal patient", reference: "PORTAL-OTHER")
    other_practice = Clinic::Practice.create!(name: "Synthetic unrelated portal practice", timezone: "UTC")
    [ { actor: other_actor }, { patient: other_patient }, { practice: other_practice } ].each do |changes|
      assert_no_difference -> { Clinic::PatientPortal::Request.count } do
        assert_raises(ActiveRecord::RecordNotFound) { create_request(**changes) }
      end
    end
    User.find(@portal_user.id).update!(active: false)
    assert @portal_user.active?
    assert_no_difference -> { Clinic::PatientPortal::Request.count } do
      assert_raises(ActiveRecord::RecordNotFound) { create_request }
    end
  end

  test "existing staff-origin refill without portal identity still creates and replays" do
    assert_difference -> { Clinic::PatientPortal::Request.count }, 1 do
      request = create_request(identity: nil, actor: nil, kind: "refill", source: "staff")
      assert_nil request.identity_id
      assert_equal "staff", request.origin
      replay = create_request(identity: nil, actor: nil, kind: "refill", source: "staff")
      assert_equal request.id, replay.id
    end
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    assert_response :success
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def submit(key, kind)
    payload = { request_key: key, request_type: kind }
    if kind == "refill"
      payload.merge!(medication_name: "Synthetic medication", pharmacy_destination: "Synthetic pharmacy", request_note: "Synthetic review request")
    else
      payload[:content] = "Synthetic #{kind} request"
    end
    post "/api/patient_portal/requests", params: { patient_portal_request: payload }, headers: csrf_headers, as: :json
  end

  def revoke_after_auth
    original = Clinic::PatientPortal::CreateRequest.method(:call)
    calls = 0
    intercepted = ->(**arguments) do
      calls += 1
      assert arguments.fetch(:identity).active?
      revoke!
      assert arguments.fetch(:identity).active?, "The controller's independent cached object remains stale"
      original.call(**arguments)
    end
    Clinic::PatientPortal::CreateRequest.stub(:call, intercepted) { yield }
    assert_equal 1, calls
  end

  def revoke!
    fresh = Clinic::PatientPortal::Identity.find(@identity.id)
    Clinic::PatientPortal::RevokeIdentity.call(identity: fresh, actor: @staff, reason: "Synthetic access revocation")
  end

  def assert_revoked
    assert @identity.reload.revoked?
    assert_empty @portal_user.member_sessions
  end

  def request_audits
    Clinic::AuditEvent.where(practice: @practice, action_code: "patient_portal.request.create").count
  end

  def request_versions
    PaperTrail::Version.where(item_type: "Clinic::PatientPortal::Request").count
  end

  def create_request(identity: @identity, actor: @portal_user, practice: @practice, patient: @patient, kind: "message", source: "patient")
    content = kind == "refill" ? Clinic::PatientPortal::RefillRequestData.content(
      medication_name: "Synthetic medication", pharmacy_destination: "Synthetic pharmacy", request_note: "Synthetic review request", source:
    ) : "Synthetic #{kind} request"
    Clinic::PatientPortal::CreateRequest.call(practice:, patient:, identity:, actor:, request_key: "direct-#{kind}", request_type: kind, content:)
  end
end
