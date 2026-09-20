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

  test "linked refill carries its prior prescription series into a new review-required order" do
    prior = Clinic::Care::ClinicalPlanWorkflow.create(
      kind: :medication_requests, practice: @practice, actor: @user, patient: @patient, encounter: @encounter,
      request_key: "refill-prior-draft", attributes: {
        intent: "order", medication_name: "Synthetic linked refill", dose_text: "1 tablet", route_text: "Oral",
        frequency_text: "Once daily", instructions: "Synthetic existing directions", fulfillment_route: "outside_pharmacy",
        medication_strength: "10 mg", medication_form: "tablet", medication_code_system: "NDC",
        medication_code: "00000-0000-00", catalog_source: "Synthetic catalog", pharmacy_name: "Synthetic pharmacy",
        pharmacy_location: "Synthetic location", prescribed_quantity: "30", quantity_unit: "tablet", refills: 1
      }
    )
    prior = Clinic::Care::ClinicalPlanWorkflow.revise(
      kind: :medication_requests, series_id: prior.series_id, practice: @practice, actor: @user, patient: @patient,
      encounter: @encounter, attributes: { status: "authorized" }, expected_version: prior.version_number,
      request_key: "refill-prior-authorize"
    )
    get "/api/clinic/patients/#{@patient.id}/medication_request_series", headers: @headers
    assert_response :success
    assert_equal [ prior.series_id, "Synthetic linked refill" ],
      response.parsed_body.dig("prescription_orders", 0).values_at("series_id", "medication_name")
    post "/api/clinic/refill_requests", params: { refill_request: {
      request_key: "linked-refill-intake", patient_id: @patient.id, medication_name: "Synthetic linked refill",
      pharmacy_destination: "Synthetic pharmacy", medication_request_series_id: prior.series_id
    } }, headers: csrf_headers, as: :json
    assert_response :created
    request = @practice.patient_portal_requests.refill.order(:id).last
    post "/api/clinic/refill_requests/#{request.id}/transition", params: { refill_request: {
      request_key: "linked-refill-approve", status: "resolved", decision: "approved",
      patient_message: "Approved after synthetic medication reconciliation.", reconciliation_acknowledged: true,
      encounter_id: @encounter.id
    } }, headers: csrf_headers, as: :json
    assert_response :success
    replacement = Clinic::Care::MedicationRequestRevision.find(request.reload.medication_request_revision_id)
    assert_equal [ "authorized", prior.series_id, prior.medication_strength, prior.pharmacy_name ],
      [ replacement.status, replacement.refill_of_series_id, replacement.medication_strength, replacement.pharmacy_name ]
    assert_equal 2, replacement.version_number
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
