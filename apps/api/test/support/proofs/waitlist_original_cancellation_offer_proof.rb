require "test_helper"

class WaitlistOriginalCancellationOfferTest < ActionDispatch::IntegrationTest
  # Exercise the real after-all-transactions-commit callback. An outer fixture
  # transaction would defer automatic offers until after the assertions.
  self.use_transactional_tests = false

  setup do
    travel_to Time.utc(2026, 10, 1, 8)
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    suffix = SecureRandom.hex(6)
    organization = Organization.create!(name: "Synthetic cancellation offer #{suffix}")
    @practice = Clinic::Practice.create!(name: "Synthetic cancellation offer #{suffix}", organization: organization, timezone: "UTC")
    @staff = User.create!(email_address: "synthetic-offer-staff-#{suffix}@example.invalid", password: @password)
    membership = @practice.memberships.create!(user: @staff)
    grant_permissions!(membership, "appointments.book", "appointments.read", "appointments.status_transition", "patients.identity.read", "notes.sign")
    @site = @practice.sites.create!(code: "SYN-OFFER", name: "Synthetic eligible site", status: "active")
    department = @practice.departments.create!(code: "SYN-OFFER-DEPT")
    @clinician = @practice.clinician_profiles.create!(membership: membership, display_name: "Synthetic eligible clinician")
    @clinician.assignments.create!(practice: @practice, site: @site, department: department, effective_from: Time.utc(2026, 1, 1))
    Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
      kind: "weekly", weekday: 4, start_minute: 0, end_minute: 1440, active: true)
    @visit_type = @practice.visit_types.create!(code: "SYN-OFFER-VISIT")
    @cancelled_patient = @practice.patients.create!(display_name: "Synthetic Cancelled Visit Patient", reference: "SYN-CANCEL-901")
    @waiting_patient = @practice.patients.create!(display_name: "Synthetic Waitlist Patient", reference: "SYN-WAIT-801")
    @waiting_user = User.create!(email_address: "synthetic-offer-patient-#{suffix}@example.invalid", password: @password)
    Clinic::PatientPortal::Identity.create!(practice: @practice, patient: @waiting_patient, user: @waiting_user,
      status: "active", invited_at: 1.day.ago, activated_at: 1.day.ago)
    @waiting_patient.patient_memberships.create!(practice: @practice, recorded_by_membership: membership,
      status: "member", version: 1, effective_from: 1.day.ago)
    @entry = Clinic::Scheduling::WaitlistEntry.create!(practice: @practice, patient: @waiting_patient,
      site: @site, clinician: @clinician, visit_type: @visit_type, earliest_at: Time.utc(2026, 10, 1, 9),
      latest_at: Time.utc(2026, 10, 1, 11), duration_minutes: 30, state: "waiting", reason: "Synthetic cancellation recovery")
    login(@staff)
  end

  test "Muse 78 committed cancellation automatically offers the matching opening and patient API retains it" do
    post "/api/clinic/appointments", params: { appointment: {
      patient_id: @cancelled_patient.id, site_id: @site.id, booked_clinician_id: @clinician.id,
      visit_type_id: @visit_type.id, starts_at: "2026-10-01T10:00:00Z",
      ends_at: "2026-10-01T10:30:00Z", request_key: "synthetic-cancelled-opening"
    } }, headers: csrf_headers, as: :json
    assert_response :created
    appointment_id = response.parsed_body.fetch("appointment").fetch("id")
    assert_equal "waiting", @entry.reload.state

    post "/api/clinic/appointments/#{appointment_id}/transition", params: {
      transition: { to: "cancelled", expected_status: "scheduled", cancellation_message_acknowledged: true }
    }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "cancelled", @practice.appointments.find(appointment_id).reload.status
    @entry.reload
    assert_equal "offered", @entry.state
    assert_equal Time.utc(2026, 10, 1, 10), @entry.offer_starts_at
    assert_equal Time.utc(2026, 10, 1, 10, 30), @entry.offer_ends_at
    assert_equal Time.utc(2026, 10, 1, 10), @entry.offer_expires_at
    assert_equal [@waiting_patient.id, @site.id, @clinician.id, @visit_type.id],
      [@entry.patient_id, @entry.site_id, @entry.clinician_id, @entry.visit_type_id]

    get "/api/clinic/waitlist", headers: @headers
    assert_response :success
    staff_row = response.parsed_body.fetch("entries").find { |row| row.fetch("id") == @entry.id }
    assert_not_nil staff_row
    assert_equal "offered", staff_row.fetch("state")
    assert_equal @waiting_patient.id, staff_row.fetch("patient_id")

    login(@waiting_user)
    2.times do
      get "/api/patient_portal/waitlist", headers: @headers
      assert_response :success
      assert_equal true, response.parsed_body.fetch("can_accept")
      row = response.parsed_body.fetch("entries").find { |item| item.fetch("id") == @entry.id }
      assert_not_nil row
      assert_equal "offered", row.fetch("state")
      assert_equal @clinician.id, row.fetch("clinician_id")
      assert_equal "Synthetic eligible clinician", row.fetch("clinician_name")
      assert_equal Time.utc(2026, 10, 1, 10), Time.iso8601(row.fetch("offer_starts_at"))
      assert_equal Time.utc(2026, 10, 1, 10), Time.iso8601(row.fetch("offer_expires_at"))
      refute row.key?("patient_id")
      refute row.key?("patient_name")
      refute row.key?("reason")
    end
  end

  private

  def setup_fixtures(*args)
    connection = ActiveRecord::Base.connection
    actual_database = connection.select_value("SELECT current_database()")
    unless Rails.env.test? && ENV["WAITLIST_QA_DISPOSABLE_DB"] == "1" &&
      actual_database == ENV["APPLY_TEST_DATABASE"] &&
      actual_database.match?(/\Aapply_waitlist_proof_20261001_[0-9a-f]{10}\z/) &&
      connection.open_transactions.zero?
      raise "Run this explicit proof only in its disposable test database without an outer transaction"
    end
    super
  end

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
