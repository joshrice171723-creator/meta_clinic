require "test_helper"

class AppointmentCreateIdempotencyTest < ActionDispatch::IntegrationTest
  setup do
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @own = tenant("own")
    @foreign = tenant("foreign")
    login(@own.fetch(:user))
  end

  test "keyed appointment creation replays exactly, rejects changed data, and stays practice scoped" do
    request_key = "appointment-create-replay"
    payload = appointment_payload(@own, request_key:)

    assert_difference -> { @own.fetch(:practice).appointments.count }, 1 do
      submit "/api/clinic/appointments", payload
      assert_response :created
      @created_id = response.parsed_body.dig("appointment", "id")
      assert_equal request_key, response.parsed_body.fetch("request_key")

      submit "/api/clinic/appointments", payload
      assert_response :created
      assert_equal @created_id, response.parsed_body.dig("appointment", "id")
      assert_equal request_key, response.parsed_body.fetch("request_key")
    end
    assert_equal 1, Clinic::OperationReceipt.where(
      practice: @own.fetch(:practice), operation_code: "appointments.book", request_key:
    ).count

    assert_no_difference -> { @own.fetch(:practice).appointments.count } do
      submit "/api/clinic/appointments", payload.deep_merge(
        appointment: { ends_at: "2026-10-01T10:00:00Z" }
      )
      assert_response :conflict
      assert_equal "idempotency_conflict", response.parsed_body.fetch("code")
    end

    login(@foreign.fetch(:user))
    assert_difference -> { @foreign.fetch(:practice).appointments.count }, 1 do
      submit "/api/clinic/appointments", appointment_payload(@foreign, request_key:)
      assert_response :created
      assert_equal request_key, response.parsed_body.fetch("request_key")
    end
    assert_equal 1, Clinic::OperationReceipt.where(
      practice: @foreign.fetch(:practice), operation_code: "appointments.book", request_key:
    ).count
  end

  test "legacy appointment creation remains available without a request key" do
    assert_difference -> { @own.fetch(:practice).appointments.count }, 1 do
      submit "/api/clinic/appointments", appointment_payload(@own).except(:request_key)
      assert_response :created
    end
  end

  private

  def tenant(label)
    organization = Organization.create!(name: "Appointment create #{label} organization")
    practice = Clinic::Practice.create!(name: "Appointment create #{label} practice", organization:, timezone: "UTC")
    user = User.create!(email_address: "appointment-create-#{label}@example.invalid", password: @password)
    membership = practice.memberships.create!(user:)
    grant_permissions!(membership, "appointments.book")
    patient = practice.patients.create!(display_name: "Appointment create #{label} patient", reference: "CREATE-#{label.upcase}")
    site = practice.sites.create!(code: "CREATE-#{label.upcase}")
    { practice:, user:, patient:, site: }
  end

  def appointment_payload(tenant, request_key: nil)
    appointment = {
      patient_id: tenant.fetch(:patient).id,
      site_id: tenant.fetch(:site).id,
      starts_at: "2026-10-01T09:00:00Z",
      ends_at: "2026-10-01T09:30:00Z"
    }
    appointment[:request_key] = request_key if request_key
    { appointment: }
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def submit(path, params = {})
    post path, params:, headers: csrf_headers, as: :json
  end

  def login(user)
    submit "/api/session", { email_address: user.email_address, password: @password }
    assert_response :success
  end
end
