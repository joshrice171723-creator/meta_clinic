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

  test "phone lookup uses the latest version even when the previous number was preferred" do
    @patient.contacts.create!(practice: @practice, contact_type: "phone", contact_value: "+12025550127",
      preferred: false, effective_from: Time.current)

    get "/api/clinic/patients/lookup", params: { phone: "15558675309" }, headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("patients")

    get "/api/clinic/patients/lookup", params: { phone: "12025550127" }, headers: @headers
    assert_response :success
    row = response.parsed_body.fetch("patients").sole
    assert_equal @patient.id, row.fetch("id")
    assert_equal "ending 0127", row.fetch("phone_hint")
  end

  test "a phone removal suppresses historical phone matching and masked output" do
    now = Time.current
    @patient.contacts.create!(practice: @practice, contact_type: "phone", contact_value: "+1 (555) 867-5309",
      preferred: true, effective_from: now - Rational(1, 1_000_000), effective_until: now)

    get "/api/clinic/patients/lookup", params: { phone: "15558675309" }, headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("patients")

    get "/api/clinic/patients/lookup", params: { id: @patient.id }, headers: @headers
    assert_response :success
    assert_nil response.parsed_body.fetch("patients").sole.fetch("phone_hint")
  end

  test "registration removal appends a closure and preserves the original phone" do
    grant_permissions!(@practice.memberships.first!, "patients.identity.read", "patients.write", "patients.read")
    original = @patient.contacts.sole
    original_attributes = original.attributes

    travel_to(Time.current + 1.minute) do
      now = Current.business_time
      assert_difference -> { @patient.contacts.count }, 1 do
        patch "/api/clinic/patients/#{@patient.id}", params: { clinic_patient: {
          display_name: @patient.display_name, reference: @patient.reference,
          contact_type: "phone", contact_value: "", request_key: "remove-current-phone"
        } }, headers: csrf_headers, as: :json
        assert_response :success
      end
      closure = @patient.contacts.order(:id).last
      assert_equal original_attributes, original.reload.attributes
      assert_equal original.contact_value, closure.contact_value
      assert_equal now, closure.effective_until
      assert_equal Rational(1, 1_000_000), closure.effective_until.to_r - closure.effective_from.to_r
      assert_nil Clinic::Care::CurrentPatientContact.call(patient: @patient, contact_type: "phone")

      get "/api/clinic/patients/lookup", params: { phone: "15558675309" }, headers: @headers
      assert_response :success
      assert_empty response.parsed_body.fetch("patients")
    end
  end

  test "a future phone version does not supersede the current effective version early" do
    @patient.contacts.create!(practice: @practice, contact_type: "phone", contact_value: "+12025550127",
      preferred: false, effective_from: 1.day.from_now)

    get "/api/clinic/patients/lookup", params: { phone: "15558675309" }, headers: @headers
    assert_response :success
    assert_equal @patient.id, response.parsed_body.fetch("patients").sole.fetch("id")
    assert_equal "ending 5309", Clinic::Care::PatientIdentitySearch.masked_phone(@patient)
  end

  test "phone activation and expiry follow business time without any identity write" do
    starts_at = 1.day.from_now.change(usec: 0)
    @patient.contacts.create!(practice: @practice, contact_type: "phone", contact_value: "+12025550127",
      preferred: false, effective_from: starts_at, effective_until: starts_at + 1.day)
    original_patient = @patient.reload.attributes
    original_contacts = @patient.contacts.order(:id).map(&:attributes)

    get "/api/clinic/patients/lookup", params: { phone: "15558675309" }, headers: @headers
    assert_response :success
    assert_equal [ @patient.id ], response.parsed_body.fetch("patients").pluck("id")
    get "/api/clinic/patients/lookup", params: { phone: "12025550127" }, headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("patients")

    travel_to(starts_at + 1.minute) do
      login(@practice.memberships.first!.user)
      get "/api/clinic/patients/lookup", params: { phone: "15558675309" }, headers: @headers
      assert_response :success
      assert_empty response.parsed_body.fetch("patients")
      get "/api/clinic/patients/lookup", params: { phone: "12025550127" }, headers: @headers
      assert_response :success
      row = response.parsed_body.fetch("patients").sole
      assert_equal @patient.id, row.fetch("id")
      assert_equal "ending 0127", row.fetch("phone_hint")
    end

    travel_to(starts_at + 1.day + 1.minute) do
      login(@practice.memberships.first!.user)
      %w[15558675309 12025550127].each do |phone|
        get "/api/clinic/patients/lookup", params: { phone: phone }, headers: @headers
        assert_response :success
        assert_empty response.parsed_body.fetch("patients")
      end
      get "/api/clinic/patients/lookup", params: { id: @patient.id }, headers: @headers
      assert_response :success
      assert_nil response.parsed_body.fetch("patients").sole.fetch("phone_hint")
    end
    assert_equal original_patient, @patient.reload.attributes
    assert_equal original_contacts, @patient.contacts.order(:id).map(&:attributes)
  end

  test "chart phone projection follows effective contact boundaries without writes" do
    grant_permissions!(@practice.memberships.first!, "patients.read")
    starts_at = 1.day.from_now.change(usec: 0)
    @patient.contacts.create!(practice: @practice, contact_type: "phone", contact_value: "+12025550127",
      preferred: false, effective_from: starts_at, effective_until: starts_at + 1.day)
    original_patient = @patient.reload.attributes
    original_contacts = @patient.contacts.order(:id).map(&:attributes)
    [ [ starts_at - 1.minute, "+1 (555) 867-5309" ], [ starts_at, "+12025550127" ],
      [ starts_at + 1.day, nil ] ].each do |at, expected_phone|
      travel_to(at) do
        login(@practice.memberships.first!.user)
        get "/api/clinic/patients/#{@patient.id}", headers: @headers
        assert_response :success
        phones = response.parsed_body.fetch("patient").fetch("contacts").select { |contact| contact.fetch("contact_type") == "phone" }
        assert_equal expected_phone ? [ expected_phone ] : [], phones.pluck("contact_value")
        assert_equal original_patient, @patient.reload.attributes
        assert_equal original_contacts, @patient.contacts.order(:id).map(&:attributes)
      end
    end
  end

  test "booking name queries immediately find synthetic names independently of their references" do
    mercer = @practice.patients.create!(display_name: "SYN_Mercer, Alex", reference: "LOOKUP-111-A")
    vale = @practice.patients.create!(display_name: "SYN_Vale, Briar", reference: "LOOKUP-111-B")
    queries = {
      "SYN" => [ mercer.id, vale.id ], "Mercer" => [ mercer.id ],
      "SYN_Mercer" => [ mercer.id ], "SYN_Mercer, Alex" => [ mercer.id ],
      "Alex" => [ mercer.id ], "Vale" => [ vale.id ],
      "SYN_Vale" => [ vale.id ], "Briar" => [ vale.id ]
    }
    # Repeat through the actual authorized endpoint; callbacks must have indexed
    # names synchronously, with no dependency on a matching clinic reference.
    2.times do
      queries.each do |query, expected_ids|
        get "/api/clinic/patients/lookup", params: { q: query }, headers: @headers
        assert_response :success
        assert_equal expected_ids, response.parsed_body.fetch("patients").pluck("id"), query
      end
    end
  end

  test "identity-only lookup resolves an exact local id without widening chart access" do
    get "/api/clinic/patients/lookup", params: { id: @patient.id }, headers: @headers
    assert_response :success
    assert_equal [ @patient.id ], response.parsed_body.fetch("patients").pluck("id")
    assert_equal %w[date_of_birth display_name id phone_hint primary_site_id reference],
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
