require "test_helper"

class ClinicPatientNameLookupS1Test < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Patient lookup organization")
    @practice = Clinic::Practice.create!(name: "Patient lookup practice", organization: organization)
    membership_user = User.create!(email_address: "patient-lookup@example.invalid", password: @password)
    membership = @practice.memberships.create!(user: membership_user)
    grant_permissions!(membership, "patients.identity.read", "patients.write")
    @patient = @practice.patients.create!(display_name: "Amélie Searchable", reference: "REF-S1-918")
    @patient.create_demographics!(practice: @practice, date_of_birth: Date.new(1988, 4, 12),
      sex: "unknown", primary_language: "English", interpreter_required: false)
    @patient.contacts.create!(practice: @practice, contact_type: "phone", contact_value: "+1 (555) 867-5309",
      preferred: true, effective_from: Time.current)
    other_practice = Clinic::Practice.create!(name: "Other lookup practice", organization: organization)
    @other_patient = other_practice.patients.create!(display_name: "Amelie Hidden", reference: "OTHER-S1-919")
    login(membership_user)
  end

  test "lookup searches normalized name prefixes and references within the active tenant" do
    get "/api/clinic/patients/lookup", params: { q: "amel" }, headers: @headers
    assert_response :success
    assert_equal [ @patient.id ], response.parsed_body.fetch("patients").pluck("id")

    get "/api/clinic/patients/lookup", params: { q: "amel", date_of_birth: "1988-04-12",
      phone: "15558675309" }, headers: @headers
    assert_response :success
    row = response.parsed_body.fetch("patients").sole
    assert_equal @patient.id, row.fetch("id")
    assert_equal "1988-04-12", row.fetch("date_of_birth")
    assert_equal "ending 5309", row.fetch("phone_hint")

    get "/api/clinic/patients/lookup", params: { q: "amel", date_of_birth: "1990-01-01" }, headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("patients")

    get "/api/clinic/patients/lookup", params: { phone: "5558670000" }, headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("patients")

    get "/api/clinic/patients/lookup", params: { q: "S1-918" }, headers: @headers
    assert_response :success
    assert_equal [ @patient.id ], response.parsed_body.fetch("patients").pluck("id")
  end

  test "identity-only lookup resolves an exact local id without widening chart access" do
    get "/api/clinic/patients/lookup", params: { id: @patient.id }, headers: @headers
    assert_response :success
    assert_equal [ @patient.id ], response.parsed_body.fetch("patients").pluck("id")
    assert_equal %w[date_of_birth display_name id phone_hint reference],
      response.parsed_body.fetch("patients").sole.keys.sort

    get "/api/clinic/patients/#{@patient.id}", headers: @headers
    assert_response :forbidden

    get "/api/clinic/patients/lookup", params: { id: @other_patient.id }, headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("patients")

    get "/api/clinic/patients/lookup", params: { id: "999999" }, headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("patients")

    get "/api/clinic/patients/lookup", params: { id: "0" }, headers: @headers
    assert_response :bad_request

    get "/api/clinic/patients/lookup", params: { id: @patient.id, q: "amel" }, headers: @headers
    assert_response :bad_request

    get "/api/clinic/patients/lookup", headers: @headers
    assert_response :bad_request
  end

  test "changing a name refreshes its searchable prefixes" do
    @patient.update!(display_name: "Renamed Person")

    get "/api/clinic/patients/lookup", params: { q: "amel" }, headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("patients")
    get "/api/clinic/patients/lookup", params: { q: "rena" }, headers: @headers
    assert_response :success
    assert_equal [ @patient.id ], response.parsed_body.fetch("patients").pluck("id")
  end

  test "creation still requires patient write permission" do
    read_only_user = User.create!(email_address: "patient-lookup-read-only@example.invalid", password: @password)
    read_only_membership = @practice.memberships.create!(user: read_only_user)
    grant_permissions!(read_only_membership, "patients.identity.read")
    login(read_only_user)

    post "/api/clinic/patients", params: {
      clinic_patient: { display_name: "Denied Person", reference: "DENIED-S1" }
    }, as: :json, headers: csrf_headers
    assert_response :forbidden
  end

  private

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
