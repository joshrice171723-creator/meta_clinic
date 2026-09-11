require "test_helper"

class RefillWorkflowTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic Refill Workflow Organization")
    @practice = Clinic::Practice.create!(name: "Synthetic Refill Workflow Practice", organization:, timezone: "UTC")
    @site = @practice.sites.create!(code: "REFILL")
    @user = User.create!(email_address: "refill-clinician@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @user)
    @practice.clinician_profiles.create!(membership: @membership, display_name: "Synthetic Refill Clinician")
    grant_permissions!(@membership, "patients.read", "clinical_records.read", "medication_requests.write")
    @patient = @practice.patients.create!(display_name: "Synthetic Refill Patient", reference: "REFILL-001")
    @encounter = @practice.encounters.create!(
      patient: @patient,
      site: @site,
      started_at: Time.utc(2026, 9, 11, 14),
      status: "open"
    )
    login
  end

  test "staff intake creates an authoritative medication order and delivery can recover" do
    assert_nil Clinic::PatientPortal::Identity.find_by(practice: @practice, patient: @patient)
    assert_difference "Clinic::PatientPortal::Request.count", 1 do
      post "/api/clinic/refill_requests", params: {
        refill_request: {
          request_key: "staff-refill-intake",
          patient_id: @patient.id,
          medication_name: "Synthetic refill medication",
          pharmacy_destination: "Synthetic pharmacy",
          request_note: "Synthetic request for workflow verification"
        }
      }, headers: csrf_headers, as: :json
      assert_response :created
    end
    request = @practice.patient_portal_requests.refill.sole
    assert_equal [ "staff", nil ], [ request.origin, request.identity_id ]

    assert_difference "Clinic::Care::MedicationRequestRevision.count", 2 do
      post "/api/clinic/refill_requests/#{request.id}/transition", params: {
        refill_request: {
          request_key: "staff-refill-approve",
          status: "resolved",
          decision: "approved",
          patient_message: "Approved after synthetic medication reconciliation.",
          reconciliation_acknowledged: true,
          encounter_id: @encounter.id
        }
      }, headers: csrf_headers, as: :json
      assert_response :success
    end
    request.reload
    revision = Clinic::Care::MedicationRequestRevision.find(request.medication_request_revision_id)
    assert_equal [ "authorized", @encounter.id, request.patient_id ],
      [ revision.status, request.source_encounter_id, revision.patient_id ]
    assert_equal [ "failed", "portal_identity_unavailable", 1 ],
      request.refill_response_delivery.values_at(:state, :failure_code, :attempt_count)

    patient_user = User.create!(email_address: "refill-patient@example.invalid", password: @password)
    Clinic::PatientPortal::Identity.create!(
      practice: @practice,
      patient: @patient,
      user: patient_user,
      status: "active",
      invited_at: Time.current,
      activated_at: Time.current
    )
    post "/api/clinic/refill_requests/#{request.id}/retry_delivery", params: {
      delivery: { request_key: "staff-refill-delivery-retry" }
    }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "delivered", response.parsed_body.dig("refill_request", "response_delivery_state")
    assert_equal [ "delivered", nil, 2 ],
      request.refill_response_delivery.reload.values_at(:state, :failure_code, :attempt_count)
  end

  private

  def login
    post "/api/session", params: { email_address: @user.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    assert_response :success
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
