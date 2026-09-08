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

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
