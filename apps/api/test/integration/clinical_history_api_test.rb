require "test_helper"

class ClinicalHistoryApiTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)

    organization = Organization.create!(name: "Clinical History Test Organization")
    @practice = Clinic::Practice.create!(name: "Clinical History Test Practice", organization: organization)
    @clinician = User.create!(email_address: "clinical-history-clinician@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @clinician)
    @site = @practice.sites.create!(code: "CARE")
    @other_site = @practice.sites.create!(code: "OTHER")
    grant_permissions!(@membership, "patients.read")
    grant_permissions!(@membership, "notes.write", scope_kind: "site", site: @site)

    @patient = @practice.patients.create!(display_name: "Rowan, Avery", reference: "HISTORY-001")
    @encounter = @practice.encounters.create!(
      patient: @patient,
      site: @site,
      started_at: Time.utc(2026, 9, 6, 14),
      status: "open"
    )
    @other_site_encounter = @practice.encounters.create!(
      patient: @patient,
      site: @other_site,
      started_at: Time.utc(2026, 9, 6, 15),
      status: "open"
    )
    @closed_encounter = @practice.encounters.create!(
      patient: @patient,
      site: @site,
      started_at: Time.utc(2026, 9, 5, 14),
      ended_at: Time.utc(2026, 9, 5, 15),
      status: "completed"
    )

    login(@clinician)
  end

  test "clinician can create replay read update and review clinical history during an open encounter" do
    allergy_request = allergy_params(request_key: "allergy-create-001")
    post history_path("allergies"), params: allergy_request, headers: csrf_headers, as: :json
    assert_response :created
    first_allergy = response.parsed_body.fetch("record")

    post history_path("allergies"), params: allergy_request, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal first_allergy, response.parsed_body.fetch("record")
    assert_equal 1, @patient.allergies.reload.count
    assert_equal 1, Clinic::OperationReceipt.where(
      practice: @practice,
      request_key: "allergy-create-001"
    ).count

    post history_path("medications"),
      params: medication_params(request_key: "medication-create-001"),
      headers: csrf_headers,
      as: :json
    assert_response :created
    medication_id = response.parsed_body.dig("record", "id")

    post history_path("conditions"),
      params: condition_params(request_key: "condition-create-001"),
      headers: csrf_headers,
      as: :json
    assert_response :created
    condition_id = response.parsed_body.dig("record", "id")

    patch history_path("allergies", first_allergy.fetch("id")),
      params: allergy_params(
        request_key: "allergy-update-001",
        lock_version: first_allergy.fetch("lock_version"),
        reaction: "Localized rash"
      ),
      headers: csrf_headers,
      as: :json
    assert_response :success
    updated_allergy = response.parsed_body.fetch("record")
    assert_equal "Localized rash", updated_allergy.fetch("reaction")

    post review_path,
      params: review_params(request_key: "allergy-review-001", outcome: "current_list_confirmed"),
      headers: csrf_headers,
      as: :json
    assert_response :created
    review = response.parsed_body.fetch("review")
    assert_equal "allergies", review.fetch("topic")
    assert_equal "current_list_confirmed", review.fetch("outcome")

    get history_path, params: { encounter_id: @encounter.id }, headers: @headers
    assert_response :success
    history = response.parsed_body
    assert_equal "patient-clinical-history-v1", history.fetch("schema_version")
    assert_equal true, history.fetch("can_write")
    assert_equal [ first_allergy.fetch("id") ], history.fetch("allergies").map { |item| item.fetch("id") }
    assert_equal [ medication_id ], history.fetch("medications").map { |item| item.fetch("id") }
    assert_equal [ condition_id ], history.fetch("conditions").map { |item| item.fetch("id") }
    assert_equal review.fetch("id"), history.dig("reviews", "allergies", "id")
    assert history.fetch("allergies").sole.fetch("last_reviewed_at").present?
  end

  test "stale updates conflict and none reported cannot contradict an active allergy" do
    post history_path("allergies"),
      params: allergy_params(request_key: "allergy-stale-create"),
      headers: csrf_headers,
      as: :json
    assert_response :created
    allergy = response.parsed_body.fetch("record")

    patch history_path("allergies", allergy.fetch("id")),
      params: allergy_params(
        request_key: "allergy-stale-first",
        lock_version: allergy.fetch("lock_version"),
        reaction: "First accepted reaction"
      ),
      headers: csrf_headers,
      as: :json
    assert_response :success

    patch history_path("allergies", allergy.fetch("id")),
      params: allergy_params(
        request_key: "allergy-stale-second",
        lock_version: allergy.fetch("lock_version"),
        reaction: "Stale reaction"
      ),
      headers: csrf_headers,
      as: :json
    assert_response :conflict
    assert_equal "stale_record", response.parsed_body.fetch("code")
    assert_equal "First accepted reaction", @patient.allergies.find(allergy.fetch("id")).reaction

    post review_path,
      params: review_params(request_key: "allergy-none-reported", outcome: "none_reported"),
      headers: csrf_headers,
      as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "Active allergies remain recorded"
    assert_empty @patient.history_reviews.reload
  end

  test "patients write does not grant a receptionist clinical history mutation authority" do
    receptionist = User.create!(email_address: "clinical-history-reception@example.invalid", password: @password)
    receptionist_membership = @practice.memberships.create!(user: receptionist)
    grant_permissions!(receptionist_membership, "patients.read", "patients.write")
    login(receptionist)

    post history_path("allergies"),
      params: allergy_params(request_key: "reception-allergy-create"),
      headers: csrf_headers,
      as: :json

    assert_response :forbidden
    assert_empty @patient.allergies.reload
    assert @practice.audit_events.where(action_code: "notes.write", outcome: "denied").exists?
  end

  test "clinical history writes deny the wrong site tenant and closed encounter" do
    post history_path("allergies"),
      params: allergy_params(request_key: "wrong-site", encounter_id: @other_site_encounter.id),
      headers: csrf_headers,
      as: :json
    assert_response :forbidden

    post history_path("allergies"),
      params: allergy_params(request_key: "closed-encounter", encounter_id: @closed_encounter.id),
      headers: csrf_headers,
      as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "only during an open encounter"

    foreign_practice = Clinic::Practice.create!(name: "Foreign Clinical History Test Practice")
    foreign_patient = foreign_practice.patients.create!(display_name: "Morgan, Casey", reference: "HISTORY-FOREIGN")
    foreign_site = foreign_practice.sites.create!(code: "FOREIGN")
    foreign_encounter = foreign_practice.encounters.create!(
      patient: foreign_patient,
      site: foreign_site,
      started_at: Time.utc(2026, 9, 6, 16),
      status: "open"
    )

    post history_path("allergies", patient: foreign_patient),
      params: allergy_params(request_key: "wrong-tenant", encounter_id: foreign_encounter.id),
      headers: csrf_headers,
      as: :json
    assert_response :not_found

    assert_empty @patient.allergies.reload
    assert_empty foreign_patient.allergies.reload
  end

  private

  def history_path(kind = nil, id = nil, patient: @patient)
    path = "/api/clinic/patients/#{patient.id}/clinical_history"
    path += "/#{kind}" if kind
    path += "/#{id}" if id
    path
  end

  def review_path
    "#{history_path}/reviews"
  end

  def allergy_params(request_key:, encounter_id: @encounter.id, lock_version: nil, reaction: "Hives")
    values = {
      encounter_id: encounter_id,
      request_key: request_key,
      allergen_name: "Penicillin",
      reaction: reaction,
      category: "medication",
      clinical_status: "active",
      verification_status: "confirmed",
      criticality: "high",
      severity: "moderate",
      onset_at: "2026-08-01T12:00:00Z"
    }
    values[:lock_version] = lock_version unless lock_version.nil?
    { clinical_history: values }
  end

  def medication_params(request_key:)
    {
      clinical_history: {
        encounter_id: @encounter.id,
        request_key: request_key,
        medication_name: "Cetirizine",
        dose_text: "10 mg",
        route_text: "oral",
        frequency_text: "once daily",
        purpose: "Seasonal allergy symptoms",
        status: "active",
        information_source: "patient",
        effective_from: "2026-08-15T12:00:00Z",
        asserted_at: "2026-09-06T14:05:00Z"
      }
    }
  end

  def condition_params(request_key:)
    {
      clinical_history: {
        encounter_id: @encounter.id,
        request_key: request_key,
        condition_name: "Seasonal allergic rhinitis",
        care_instruction: "Review symptom control at the next visit",
        clinical_status: "active",
        verification_status: "confirmed",
        affects_current_care: true,
        onset_at: "2025-04-01T12:00:00Z"
      }
    }
  end

  def review_params(request_key:, outcome:)
    {
      review: {
        encounter_id: @encounter.id,
        request_key: request_key,
        topic: "allergies",
        outcome: outcome,
        information_source: "patient",
        notes: "History reviewed during the encounter"
      }
    }
  end

  def login(user)
    post "/api/session",
      params: { email_address: user.email_address, password: @password },
      headers: csrf_headers,
      as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
