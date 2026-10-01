require "test_helper"

class PatientRegistrationIntegrityTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "registration-integrity@example.invalid", password: @password)
    @membership = Development::TestClinic.create!(@user)
    @practice = @membership.practice
    @patient = @practice.patients.first
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
    @registration_site = @practice.sites.create!(code: "REGISTRATION-FIXTURE", status: "active")
    @practice.visit_types.create!(code: "Synthetic registration visit")
    Development::GuidedClinicDemo.configure_site_profile!(practice: @practice, site: @registration_site, membership: @membership,
      clinic_type: "primary_care", request_key: "independent-registration-site-profile", finalize: true)
    patch "/api/clinic/context", params: { site_id: @registration_site.id }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "a rejected registration update leaves identity and audit history unchanged" do
    original_name = @patient.display_name
    original_reference = @patient.reference
    original_version_count = @patient.versions.count
    original_related_counts = {
      demographics: @patient.demographics ? 1 : 0,
      contacts: @patient.contacts.count,
      emergency_contacts: @patient.emergency_contacts.count,
      communication_preferences: @patient.communication_preference ? 1 : 0,
      social_histories: @patient.social_histories.count
    }

    patch "/api/clinic/patients/#{@patient.id}", params: {
      clinic_patient: {
        display_name: "Synthetic rejected registration",
        reference: "SYN-REJECTED-REGISTRATION",
        date_of_birth: "2099-01-01"
      }
    }, headers: csrf_headers, as: :json

    assert_response :unprocessable_entity
    assert_equal original_name, @patient.reload.display_name
    assert_equal original_reference, @patient.reference
    assert_equal original_version_count, @patient.versions.count
    assert_equal original_related_counts[:demographics], @patient.demographics ? 1 : 0
    assert_equal original_related_counts[:contacts], @patient.contacts.count
    assert_equal original_related_counts[:emergency_contacts], @patient.emergency_contacts.count
    assert_equal original_related_counts[:communication_preferences], @patient.communication_preference ? 1 : 0
    assert_equal original_related_counts[:social_histories], @patient.social_histories.count
  end

  test "registration requires a documented sex or Unknown and rejects invalid supplied contacts atomically" do
    invalid_registrations = [
      [ { sex: nil }, :bad_request ],
      [ { sex: "not_recorded" }, :unprocessable_entity ],
      [ { sex: "female", contact_type: "email", contact_value: "not-an-email" }, :unprocessable_entity ],
      [ { sex: "female", contact_type: "phone", contact_value: "no digits" }, :unprocessable_entity ],
      [ { sex: "female", emergency_name: "Emergency", emergency_relationship: "Parent", emergency_phone: "no digits" }, :unprocessable_entity ]
    ]

    invalid_registrations.each_with_index do |(attributes, expected_status), index|
      assert_no_difference "@practice.patients.count" do
        post "/api/clinic/patients", params: {
          clinic_patient: {
            display_name: "Invalid registration #{index}",
            reference: "INVALID-REG-#{index}"
          }.merge(attributes)
        }, headers: csrf_headers, as: :json
      end
      assert_response expected_status
    end
  end

  test "registration preserves an unknown date of birth without inventing one" do
    site = @registration_site
    patch "/api/clinic/context", params: { site_id: site.id }, headers: csrf_headers, as: :json
    assert_response :success
    post "/api/clinic/patients", params: {
      clinic_patient: {
        display_name: "Unknown birth date patient", reference: "UNKNOWN-DOB-001",
        sex: "unknown", primary_language: "English"
      }
    }, headers: csrf_headers, as: :json

    assert_response :created
    patient_id = response.parsed_body.fetch("id")
    get "/api/clinic/patients/#{patient_id}", headers: @headers
    assert_response :success
    patient = response.parsed_body.fetch("patient")
    assert_equal site.id, patient.fetch("primary_site_id")
    assert_nil patient.dig("demographics", "date_of_birth")
    assert_equal "unknown", patient.dig("demographics", "date_of_birth_status")
  end

  test "patient directory filters by a clinic site and rejects an unknown site" do
    site = @registration_site
    @patient.update!(primary_site: site)

    get "/api/clinic/patients", params: { site_id: site.id }, headers: @headers
    assert_response :success
    assert_includes response.parsed_body.fetch("patients").map { |row| row.fetch("id") }, @patient.id
    assert response.parsed_body.fetch("patients").all? { |row| row.fetch("primary_site_id") == site.id }

    get "/api/clinic/patients", params: { site_id: site.id + 1_000_000 }, headers: @headers
    assert_response :not_found

    other_practice = Clinic::Practice.create!(name: "Synthetic Other Practice", organization: @practice.organization)
    other_site = other_practice.sites.create!(code: "OTHER")
    get "/api/clinic/patients", params: { site_id: other_site.id }, headers: @headers
    assert_response :not_found
    @patient.primary_site = other_site
    refute @patient.valid?
  end

  test "partial registration edits preserve demographics and communication preferences" do
    post "/api/clinic/patients", params: {
      clinic_patient: {
        display_name: "Registration preservation", reference: "REG-PRESERVE", sex: "unknown",
        date_of_birth: "1990-01-02", primary_language: "Spanish", interpreter_required: true,
        preferred_contact_method: "text", appointment_reminders_consent: true, general_communications_consent: true
      }
    }, headers: csrf_headers, as: :json

    assert_response :created
    patient_id = response.parsed_body.fetch("id")
    patch "/api/clinic/patients/#{patient_id}", params: {
      clinic_patient: { display_name: "Registration preservation updated", reference: "REG-PRESERVE" }
    }, headers: csrf_headers, as: :json

    assert_response :success
    patient = @practice.patients.find(patient_id)
    assert_equal "unknown", patient.demographics.sex
    assert_equal Date.new(1990, 1, 2), patient.demographics.date_of_birth
    assert_equal "Spanish", patient.demographics.primary_language
    assert_equal true, patient.demographics.interpreter_required
    assert_equal "text", patient.communication_preference.preferred_contact_method
    assert_equal true, patient.communication_preference.appointment_reminders_consent
    assert_equal true, patient.communication_preference.general_communications_consent
  end

  test "registration update cannot change the clinic reference" do
    original_name = @patient.display_name
    original_reference = @patient.reference

    patch "/api/clinic/patients/#{@patient.id}", params: {
      clinic_patient: {
        display_name: "Synthetic renamed patient",
        reference: "SYNTHETIC-REFERENCE-CHANGE"
      }
    }, headers: csrf_headers, as: :json

    assert_response :unprocessable_entity
    assert_equal "Clinic reference cannot be changed after registration.", response.parsed_body.fetch("error")
    assert_equal [ original_name, original_reference ], @patient.reload.attributes.values_at("display_name", "reference")
  end

  test "registration preserves stable identity names language contact and current address history" do
    post "/api/clinic/patients", params: {
      clinic_patient: {
        request_key: "registration-complete-identity", display_name: "Mercer, Alex",
        reference: "META-IDENTITY-001", legal_name: "Alexander Mercer", preferred_name: "Alex",
        primary_address: "101 Current Street, Suite 4, Austin, TX 78701",
        date_of_birth: "1988-04-12", sex: "male", primary_language: "Spanish",
        interpreter_required: true, contact_type: "phone", contact_value: "512-555-0142", preferred: true
      }
    }, headers: csrf_headers, as: :json
    assert_response :created
    patient = @practice.patients.find(response.parsed_body.fetch("id"))

    get "/api/clinic/patients/#{patient.id}", headers: @headers
    assert_response :success
    detail = response.parsed_body.fetch("patient")
    assert_equal [ "META-IDENTITY-001", "Mercer, Alex" ], detail.values_at("reference", "display_name")
    assert_equal [ "Alexander Mercer", "Alex", "1988-04-12", "Spanish", true ],
      detail.fetch("demographics").values_at(
        "legal_name", "preferred_name", "date_of_birth", "primary_language", "interpreter_required"
      )
    assert_equal "101 Current Street, Suite 4, Austin, TX 78701", detail.dig("primary_address", "formatted")
    assert_equal "512-555-0142", detail.fetch("contacts").sole.fetch("contact_value")
    first_address_id = detail.fetch("primary_address_version_id")

    patch "/api/clinic/patients/#{patient.id}", params: {
      clinic_patient: {
        request_key: "registration-current-address", display_name: "Mercer, Alex",
        reference: "META-IDENTITY-001", preferred_name: "Lex",
        primary_address: "202 New Street, Austin, TX 78702"
      }
    }, headers: csrf_headers, as: :json
    assert_response :success
    updated = response.parsed_body.fetch("patient")
    assert_equal "Lex", updated.dig("demographics", "preferred_name")
    assert_equal "202 New Street, Austin, TX 78702", updated.dig("primary_address", "formatted")
    refute_equal first_address_id, updated.fetch("primary_address_version_id")
    assert_equal 2, patient.reload.address_versions.count

    raw_legal_name = ApplicationRecord.connection.select_value(
      "SELECT legal_name FROM clinic_patient_demographics WHERE patient_id = #{patient.id.to_i}"
    )
    raw_address = ApplicationRecord.connection.select_value(
      "SELECT encrypted_address FROM clinic_patient_address_versions WHERE id = #{updated.fetch('primary_address_version_id').to_i}"
    )
    refute_equal "Alexander Mercer", raw_legal_name
    refute_equal "202 New Street, Austin, TX 78702", raw_address

    before = [ patient.address_versions.count, patient.primary_address_version_id, patient.demographics.preferred_name ]
    patch "/api/clinic/patients/#{patient.id}", params: {
      clinic_patient: {
        display_name: "Mercer, Alex", reference: "META-IDENTITY-001", preferred_name: "Rejected",
        primary_address: "303 Rejected Street, Austin, TX 78703", contact_type: "email", contact_value: "invalid-email"
      }
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    patient.reload
    assert_equal before, [ patient.address_versions.count, patient.primary_address_version_id, patient.demographics.reload.preferred_name ]
  end

  test "qa218 browser shaped address update commits and exact replay preserves one receipt" do
    input = browser_registration_input(request_key: "qa218-address-save", primary_address: "218 Synthetic Street")
    address_count = @patient.address_versions.count
    receipts = Clinic::OperationReceipt.where(practice: @practice, actor_membership: @membership,
      request_key: input.fetch(:request_key))

    patch "/api/clinic/patients/#{@patient.id}", params: { clinic_patient: input }, headers: csrf_headers, as: :json
    assert_response :success, response.body
    saved = response.parsed_body
    assert_equal input.fetch(:request_key), saved.fetch("request_key")
    assert_equal @patient.id, saved.dig("patient", "id")
    assert_equal "218 Synthetic Street", saved.dig("patient", "primary_address", "formatted")
    assert_equal address_count + 1, @patient.reload.address_versions.count
    receipt = receipts.sole
    assert receipt.outcome_committed?
    assert_equal "patients.registration_update", receipt.operation_code
    assert_equal @patient.id, receipt.resource_id
    assert_equal @patient.class.name, receipt.resource_type
    after_save = [ @patient.updated_at, @patient.primary_address_version_id, @patient.versions.count ]

    # Same body/key includes the OLD expected timestamp. A receipt must replay
    # before the stale-write guard rather than attempting a second mutation.
    patch "/api/clinic/patients/#{@patient.id}", params: { clinic_patient: input }, headers: csrf_headers, as: :json
    assert_response :success, response.body
    assert_equal input.fetch(:request_key), response.parsed_body.fetch("request_key")
    assert_equal saved.fetch("patient"), response.parsed_body.fetch("patient")
    assert_equal 1, receipts.count
    assert_equal address_count + 1, @patient.reload.address_versions.count
    assert_equal after_save, [ @patient.updated_at, @patient.primary_address_version_id, @patient.versions.count ]
    get "/api/clinic/patients/#{@patient.id}", headers: @headers
    assert_response :success
    assert_equal "218 Synthetic Street", response.parsed_body.dig("patient", "primary_address", "formatted")
  end

  test "qa218 stale address update is a deterministic rejection without changes or receipt" do
    input = browser_registration_input(request_key: "qa218-stale-save", primary_address: "Rejected Synthetic Street")
    @patient.update_columns(updated_at: @patient.updated_at + 1.second)
    before = [ @patient.reload.attributes, @patient.address_versions.count, @patient.versions.count ]
    patch "/api/clinic/patients/#{@patient.id}", params: { clinic_patient: input }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "stale_record", response.parsed_body.fetch("code")
    assert_equal before, [ @patient.reload.attributes, @patient.address_versions.count, @patient.versions.count ]
    refute Clinic::OperationReceipt.exists?(practice: @practice, actor_membership: @membership,
      request_key: input.fetch(:request_key))
  end

  test "qa131 clearing primary address persists after reload and exact replay preserves history" do
    address = Clinic::Care::AddPatientAddress.call(practice: @practice, actor: @user, patient: @patient,
      encrypted_address: "131 Synthetic Street", make_primary: true)
    input = browser_registration_input(request_key: "qa131-clear-address", primary_address: "")
    address_count = @patient.address_versions.count
    2.times do
      patch "/api/clinic/patients/#{@patient.id}", params: { clinic_patient: input }, headers: csrf_headers, as: :json
      assert_response :success, response.body
      assert_nil response.parsed_body.dig("patient", "primary_address")
      assert_nil @patient.reload.primary_address_version_id
      assert_equal address_count, @patient.address_versions.count
      assert_equal "131 Synthetic Street", address.reload.encrypted_address
    end
    get "/api/clinic/patients/#{@patient.id}", headers: @headers
    assert_response :success
    assert_nil response.parsed_body.dig("patient", "primary_address")
    assert_nil response.parsed_body.dig("patient", "primary_address_version_id")
    assert_equal 1, Clinic::OperationReceipt.where(practice: @practice, actor_membership: @membership,
      request_key: input.fetch(:request_key)).count
  end

  test "patient detail exposes bounded metadata but identity lookup does not" do
    get "/api/clinic/patients/#{@patient.id}", headers: @headers
    assert_response :success
    history = response.parsed_body.fetch("activity_history")
    assert history.fetch("entries").length <= 25
    assert history.fetch("coverage").any? { |source| source["source"] == "registration" && source["status"] == "included" }
    get "/api/clinic/patients/lookup", params: { id: @patient.id }, headers: @headers
    assert_response :success
    refute response.parsed_body.key?("activity_history")
    refute response.parsed_body.fetch("patients").first.key?("activity_history")
  end

  private

  def browser_registration_input(request_key:, primary_address:)
    # Valid wholly synthetic form fields, including the exact version read by
    # an editor. No structured UI-only address keys enter the strict API body.
    get "/api/clinic/patients/#{@patient.id}", headers: @headers
    assert_response :success
    detail = response.parsed_body.fetch("patient")
    {
      request_key:, expected_updated_at: detail.fetch("updated_at"),
      display_name: detail.fetch("display_name"), reference: detail.fetch("reference"),
      legal_name: detail.fetch("display_name"), preferred_name: "", date_of_birth: "", sex: "unknown",
      primary_language: "", interpreter_required: "unknown", primary_address:,
      contact_type: "phone", contact_value: "", preferred: "false", preferred_contact_method: "portal",
      appointment_reminders_consent: "false", general_communications_consent: "false",
      emergency_name: "", emergency_relationship: "", emergency_phone: "", permission_to_contact: "false",
      tobacco_use: "", alcohol_use: "", exercise_habits: "", diet: "", occupation: "",
      living_situation: "", relevant_social_factors: ""
    }
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
