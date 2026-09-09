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

  test "calendar ranges include the complete clinic day across both DST transitions without leaking tenants" do
    practice = @own.fetch(:practice)
    practice.update!(timezone: "America/Chicago")
    grant_permissions!(practice.memberships.find_by!(user: @own.fetch(:user)), "appointments.read")

    [
      [ "2026-03-08", "2026-03-08T06:00:00Z", "2026-03-09T05:00:00Z" ],
      [ "2026-11-01", "2026-11-01T05:00:00Z", "2026-11-02T06:00:00Z" ]
    ].each do |date, first_instant, next_day|
      from = Time.iso8601(first_instant)
      through = Time.iso8601(next_day)
      appointments = [ from - 1.second, from, through - 1.second, through ].map do |instant|
        practice.appointments.create!(patient: @own.fetch(:patient), site: @own.fetch(:site),
          starts_at: instant, ends_at: instant + 30.minutes, status: "scheduled", visit_modality: "in_person")
      end
      @foreign.fetch(:practice).appointments.create!(patient: @foreign.fetch(:patient), site: @foreign.fetch(:site),
        starts_at: from, ends_at: from + 30.minutes, status: "scheduled", visit_modality: "in_person")

      get "/api/clinic/appointments", params: { from_date: date, through_date: date }, headers: @headers
      assert_response :success
      assert_equal appointments[1..2].map(&:id), response.parsed_body.fetch("appointments").pluck("id")
      assert_equal 2, response.parsed_body.dig("pagination", "total")

      get "/api/clinic/appointments", params: { from: first_instant, to: next_day }, headers: @headers
      assert_response :success
      assert_equal appointments[1..2].map(&:id), response.parsed_body.fetch("appointments").pluck("id")
    end
  end

  test "appointment lists reuse preloaded patient phone endpoints" do
    practice = @own.fetch(:practice)
    patient = @own.fetch(:patient)
    grant_permissions!(practice.memberships.find_by!(user: @own.fetch(:user)), "appointments.read")
    practice.communication_endpoints.create!(patient: patient, endpoint_type: "phone", label: "Mobile",
      value: "+15005550123", value_digest: Digest::SHA256.hexdigest("+15005550123"), verified_at: Time.current)
    2.times do |index|
      starts_at = Time.utc(2026, 10, 2, 9 + index)
      practice.appointments.create!(patient: patient, site: @own.fetch(:site), starts_at: starts_at,
        ends_at: starts_at + 30.minutes, status: "scheduled")
    end
    queries = []
    subscriber = ->(_name, _started, _finished, _unique_id, payload) { queries << payload[:sql].to_s }

    ActiveRecord::Base.uncached do
      ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") do
        get "/api/clinic/appointments", headers: @headers
      end
    end

    assert_response :success
    assert_equal [ "+15005550123", "+15005550123" ], response.parsed_body.fetch("appointments").pluck("patient").pluck("phone")
    assert_equal 1, queries.count { |sql| sql.match?(/FROM "clinic_communication_endpoints"/i) }, queries.join("\n")
  end

  test "incomplete and reversed calendar ranges fail instead of widening the appointment search" do
    grant_permissions!(@own.fetch(:practice).memberships.find_by!(user: @own.fetch(:user)), "appointments.read")
    [
      { from_date: "", through_date: "2026-09-10" },
      { from_date: "2026-09-10" },
      { from_date: "2026-09-11", through_date: "2026-09-10" },
      { from_date: "2026-02-30", through_date: "2026-03-01" }
    ].each do |range|
      get "/api/clinic/appointments", params: range, headers: @headers
      assert_response :bad_request
      assert response.parsed_body.fetch("error").present?
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
