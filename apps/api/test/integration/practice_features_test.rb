require "test_helper"

class PracticeFeaturesTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "practice-features@example.invalid", password: @password)
    @membership = Development::TestClinic.create!(@user)
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  test "recommended ambulatory profile is explicit and a full clinic setup is versioned" do
    get "/api/clinic/practice_features", headers: @headers
    assert_response :success
    initial = response.parsed_body.fetch("features")
    assert_equal false, initial.fetch("insurance_workflows_enabled")
    assert_equal false, initial.fetch("configured")
    assert_equal "primary_care", initial.fetch("recommended_clinic_type")
    assert_equal %w[telehealth external_lab_coordination minor_office_procedures in_office_medications],
      initial.fetch("recommended_service_scope")
    assert_equal [], initial.fetch("recommended_assessment_scope")
    assert_equal false, initial.fetch("assessment_configured")
    %w[cash_pricing estimates invoices receipts card_payments refunds credits packages memberships].each do |feature|
      assert_equal true, initial.fetch("core").fetch(feature)
    end

    payload = { features: {
      clinic_type: "membership_primary_care",
      service_scope: %w[telehealth in_office_medications],
      assessment_scope: %w[depression fall_risk],
      insurance_workflows_enabled: true,
      expected_revision: 0,
      request_key: "configure-clinic"
    } }
    put "/api/clinic/practice_features", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    saved = response.parsed_body.fetch("features")
    assert_equal true, saved.fetch("insurance_workflows_enabled")
    assert_equal true, saved.fetch("configured")
    assert_equal "membership_primary_care", saved.fetch("clinic_type")
    assert_equal %w[telehealth in_office_medications], saved.fetch("service_scope")
    assert_equal %w[depression fall_risk], saved.fetch("assessment_scope")
    assert_equal true, saved.fetch("assessment_configured")
    assert_equal 1, saved.fetch("revision")

    put "/api/clinic/practice_features", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal 1, Clinic::PracticeFeatureVersion.where(practice: @membership.practice).count
  end

  test "stale clinic setup edits do not overwrite a newer selection" do
    put "/api/clinic/practice_features", params: {
      features: profile_payload(insurance_workflows_enabled: true, expected_revision: 0,
        request_key: "first-selection")
    }, headers: csrf_headers, as: :json
    assert_response :success

    put "/api/clinic/practice_features", params: {
      features: profile_payload(insurance_workflows_enabled: false, expected_revision: 0,
        request_key: "stale-selection")
    }, headers: csrf_headers, as: :json
    assert_response :conflict
  end

  test "unknown clinic types and services are rejected without creating a version" do
    put "/api/clinic/practice_features", params: {
      features: profile_payload(clinic_type: "hospital", request_key: "unsupported-type")
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity

    put "/api/clinic/practice_features", params: {
      features: profile_payload(service_scope: %w[telehealth surgery], request_key: "unsupported-service")
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    put "/api/clinic/practice_features", params: {
      features: profile_payload(assessment_scope: %w[depression universal_triage], request_key: "unsupported-assessment")
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal 0, Clinic::PracticeFeatureVersion.where(practice: @membership.practice).count
  end

  test "a request key cannot be reused for a different clinic profile" do
    put "/api/clinic/practice_features", params: {
      features: profile_payload(request_key: "same-key")
    }, headers: csrf_headers, as: :json
    assert_response :success

    put "/api/clinic/practice_features", params: {
      features: profile_payload(clinic_type: "urgent_care", expected_revision: 1, request_key: "same-key")
    }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal 1, Clinic::PracticeFeatureVersion.where(practice: @membership.practice).count
  end

  private

  def profile_payload(overrides = {})
    {
      clinic_type: "primary_care",
      service_scope: %w[telehealth external_lab_coordination],
      assessment_scope: [],
      insurance_workflows_enabled: false,
      expected_revision: 0,
      request_key: "profile-#{SecureRandom.uuid}"
    }.merge(overrides)
  end
end
