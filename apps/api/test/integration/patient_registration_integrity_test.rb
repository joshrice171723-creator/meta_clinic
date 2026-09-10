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

    assert_response :bad_request
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

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
