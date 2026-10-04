require "test_helper"

class WaitlistOriginalConfiguredEntryTest < ActionDispatch::IntegrationTest
  setup do
    travel_to Time.utc(2026, 10, 1, 8)
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic waitlist proof organization")
    @practice = Clinic::Practice.create!(name: "Synthetic waitlist proof practice", organization: organization, timezone: "UTC")
    @user = User.create!(email_address: "synthetic-waitlist-proof@example.invalid", password: @password)
    membership = @practice.memberships.create!(user: @user)
    grant_permissions!(membership, "appointments.book", "appointments.read", "patients.identity.read", "notes.sign", "appointments.status_transition")
    @site = @practice.sites.create!(code: "SYN-WAIT", name: "Synthetic eligible site", status: "active")
    configure_site!(@site, membership: membership)
    department = @practice.departments.create!(code: "SYN-WAIT-DEPT")
    @clinician = @practice.clinician_profiles.create!(membership: membership, display_name: "Synthetic eligible clinician")
    @clinician.assignments.create!(practice: @practice, site: @site, department: department, effective_from: Time.utc(2026, 1, 1))
    Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
      kind: "weekly", weekday: 4, start_minute: 0, end_minute: 1440, active: true)
    @patient = @practice.patients.create!(display_name: "Synthetic Waitlist Patient", reference: "SYN-WAIT-801")
    @visit_type = @practice.visit_types.create!(code: "SYN-WAIT-VISIT")
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "Muse 61 configured clinician site and active visit type permit waitlist creation and durable queue readback" do
    get "/api/clinic/waitlist", headers: @headers
    assert_response :success
    options = response.parsed_body
    assert options.fetch("clinicians").any? { |row| row.fetch("id") == @clinician.id }
    assert options.fetch("sites").any? { |row| row.fetch("id") == @site.id }
    assert options.fetch("visit_types").any? { |row| row.fetch("id") == @visit_type.id }

    input = { waitlist: {
      patient_id: @patient.id, site_id: @site.id, clinician_id: @clinician.id, visit_type_id: @visit_type.id,
      earliest_at: "2026-10-01T09:00:00Z", latest_at: "2026-10-01T11:00:00Z",
      duration_minutes: 30, reason: "Synthetic eligible opening", request_key: "synthetic-waitlist-entry-proof"
    } }
    id = nil
    assert_difference -> { Clinic::Scheduling::WaitlistEntry.where(practice: @practice).count }, 1 do
      post "/api/clinic/waitlist", params: input, headers: csrf_headers, as: :json
      assert_response :created
      id = response.parsed_body.fetch("entry").fetch("id")
    end
    record = Clinic::Scheduling::WaitlistEntry.find_by!(practice: @practice, id: id).reload
    assert_equal [@patient.id, @site.id, @clinician.id, @visit_type.id, "waiting", 30],
      [record.patient_id, record.site_id, record.clinician_id, record.visit_type_id, record.state, record.duration_minutes]

    2.times do
      get "/api/clinic/waitlist", headers: @headers
      assert_response :success
      row = response.parsed_body.fetch("entries").find { |entry| entry.fetch("id") == id }
      assert_not_nil row
      assert_equal [@patient.id, @site.id, @clinician.id, @visit_type.id, "waiting", 30],
        [row.fetch("patient_id"), row.fetch("site_id"), row.fetch("clinician_id"), row.fetch("visit_type_id"), row.fetch("state"), row.fetch("duration_minutes")]
      assert_equal "Synthetic eligible clinician", row.fetch("clinician_name")
      assert_equal Time.utc(2026, 10, 1, 9), Time.iso8601(row.fetch("earliest_at"))
      assert_equal Time.utc(2026, 10, 1, 11), Time.iso8601(row.fetch("latest_at"))
    end
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
