require "test_helper"

class IntakeConsentsTest < ActionDispatch::IntegrationTest
  setup do
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic Consent Organization")
    @practice = Clinic::Practice.create!(name: "Synthetic Consent Practice", organization:, timezone: "UTC")
    @user = User.create!(email_address: "intake-consent@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "intake.write", "documents.read")
    @reader = User.create!(email_address: "intake-consent-reader@example.invalid", password: @password)
    @reader_membership = @practice.memberships.create!(user: @reader)
    grant_permissions!(@reader_membership, "patients.read")
    @patient = @practice.patients.create!(display_name: "Synthetic Consent Patient", reference: "CONSENT-001")
    @other_patient = @practice.patients.create!(display_name: "Synthetic Other Consent Patient", reference: "CONSENT-002")
    category = Clinic::DocumentCategory.create!(practice: @practice, code: "SYN-CONSENT", name: "Synthetic consent")
    @document = @practice.documents.create!(patient: @patient, category:, object_key: "private/consent-own", object_version: "1", checksum: "own", byte_size: 1, media_type: "text/plain", scan_state: "clean")
    @other_document = @practice.documents.create!(patient: @other_patient, category:, object_key: "private/consent-other", object_version: "1", checksum: "other", byte_size: 1, media_type: "text/plain", scan_state: "clean")
    login
  end

  test "records distinct purpose evidence, replays safely, and rejects stale versions" do
    treatment = consent_payload(purpose: "treatment", request_key: "consent-treatment", source_document_id: @document.id)
    assert_difference "Clinic::Care::IntakeConsentRevision.count", 1 do
      post path, params: treatment, headers: csrf_headers, as: :json
      assert_response :created
    end
    assert_equal "recorded", response.parsed_body.dig("intake_consents", "treatment", "decision")
    assert_equal @membership.id, response.parsed_body.dig("intake_consents", "treatment", "recorded_by_membership_id")

    assert_no_difference "Clinic::Care::IntakeConsentRevision.count" do
      post path, params: treatment, headers: csrf_headers, as: :json
      assert_response :created
    end
    stale = consent_payload(purpose: "treatment", request_key: "consent-treatment-stale", source_document_id: @document.id)
    post path, params: stale, headers: csrf_headers, as: :json
    assert_response :conflict

    privacy = consent_payload(purpose: "privacy_notice", request_key: "consent-privacy", source_document_id: @document.id)
    post path, params: privacy, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal 1, response.parsed_body.dig("intake_consents", "treatment", "revision")
    assert_equal 1, response.parsed_body.dig("intake_consents", "privacy_notice", "revision")
  end

  test "rejects missing recorded evidence, foreign patient documents, and denied writers" do
    missing = consent_payload(purpose: "treatment", request_key: "consent-no-evidence", source_document_id: nil)
    missing[:intake_consent][:payload][:evidence_reference] = nil
    assert_no_difference "Clinic::Care::IntakeConsentRevision.count" do
      post path, params: missing, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
    end

    foreign = consent_payload(purpose: "treatment", request_key: "consent-other-patient-document", source_document_id: @other_document.id)
    post path, params: foreign, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity

    login(@reader)
    denied = consent_payload(purpose: "treatment", request_key: "consent-denied", source_document_id: @document.id)
    post path, params: denied, headers: csrf_headers, as: :json
    assert_response :forbidden
  end

  private

  def path
    "/api/clinic/patients/#{@patient.id}/intake_consents"
  end

  def consent_payload(purpose:, request_key:, source_document_id:)
    { intake_consent: { purpose:, expected_revision: 0, request_key:, payload: {
      decision: "recorded", document_reference: "Synthetic consent", document_version: "2026-09",
      source: "patient", evidence_reference: "synthetic-external-evidence", occurred_on: "2026-09-18",
      source_document_id:
    } } }
  end

  def login(user = @user)
    post "/api/session", params: { email_address: user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    assert_response :success
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
