require "test_helper"

class PatientCareSummaryTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @organization = Organization.create!(name: "Synthetic Care Summary Organization")
    @user = User.create!(email_address: "care-summary@example.invalid", password: @password)
    @practice = Clinic::Practice.create!(name: "Synthetic Care Summary Practice", organization: @organization)
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "patients.write", "encounters.write")
    @patient = @practice.patients.create!(display_name: "Synthetic Care Patient", reference: "CARE-1")
    @other_patient = @practice.patients.create!(display_name: "Synthetic Other Patient", reference: "CARE-2")
    @encounter = @practice.encounters.create!(patient: @patient, started_at: Time.utc(2026, 9, 1, 14), status: "open")
    @other_encounter = @practice.encounters.create!(patient: @other_patient, started_at: Time.utc(2026, 9, 1, 15), status: "open")
    login(@user)
  end

  test "authorized summary returns explicit clinical, access, precaution, and review states" do
    recorded_at = Time.utc(2026, 9, 1, 14, 5)
    @patient.create_demographics!(practice: @practice, sex: "not_recorded", primary_language: "Spanish",
      interpreter_required: true)
    @patient.allergies.create!(practice: @practice, data_status: "recorded",
      allergen_name: "Synthetic allergen", reaction: "Synthetic rash", category: "medication",
      clinical_status: "active", verification_status: "confirmed", criticality: "low", severity: "mild",
      recorded_by_membership: @membership, recorded_at: recorded_at)
    @patient.medication_statements.create!(practice: @practice, data_status: "recorded",
      medication_name: "Synthetic medication", dose_text: "10 synthetic units", route_text: "By mouth",
      frequency_text: "Daily", status: "active", information_source: "patient",
      asserted_at: recorded_at, recorded_by_membership: @membership, recorded_at: recorded_at)
    @patient.care_needs.create!(practice: @practice, category: "communication",
      need_code: "spoken_language_interpreter", description: "Spanish interpreter requested",
      instructions: "Synthetic interpreter instruction", status: "active", effective_from: recorded_at,
      recorded_by_membership: @membership, recorded_at: recorded_at)
    @patient.conditions.create!(practice: @practice, data_status: "recorded",
      condition_name: "Synthetic condition", clinical_status: "active", verification_status: "confirmed",
      affects_current_care: true, care_instruction: "Synthetic care instruction",
      recorded_by_membership: @membership, recorded_at: recorded_at)
    @encounter.precautions.create!(practice: @practice, patient: @patient, precaution_type: "droplet",
      evidence_status: "suspected", status: "active", instructions: "Synthetic PPE instruction",
      recorded_by_membership: @membership, recorded_at: recorded_at)
    %w[allergies medications care_needs].each do |topic|
      @patient.history_reviews.create!(practice: @practice, encounter: @encounter, topic: topic,
        outcome: "current_list_confirmed", information_source: "patient", reviewer_membership: @membership,
        reviewed_at: recorded_at + 1.minute, request_key: "care-summary-#{topic}")
    end

    get "/api/clinic/patients/#{@patient.id}/care_summary",
      params: { encounter_id: @encounter.id }, headers: @headers

    assert_response :success
    payload = response.parsed_body
    assert_equal "patient-care-summary-v1", payload.fetch("schema_version")
    assert_equal @patient.id, payload.fetch("patient_id")
    assert_equal @encounter.id, payload.fetch("encounter_id")
    assert_equal [ "Synthetic allergen", "Synthetic rash" ],
      payload.dig("allergies", "items", 0).values_at("allergen", "reaction")
    assert_equal "Synthetic medication", payload.dig("medications", "items", 0, "medication")
    assert_equal true, payload.dig("communication", "interpreter_required")
    assert_equal "spoken_language_interpreter", payload.dig("communication", "needs", 0, "code")
    assert_equal "Synthetic condition", payload.dig("current_care_conditions", "items", 0, "condition")
    assert_equal "droplet", payload.dig("precautions", "items", 0, "type")
    assert_equal false, payload.fetch("review_needed")
    assert_empty payload.fetch("review_needed_topics")
    assert_equal %w[known known known],
      %w[allergies medications care_needs].map { |topic| payload.dig(topic, "state") }
    assert @practice.audit_events.where(action_code: "patients.read", outcome: "released").exists?
  end

  test "missing data stays not recorded and missing encounter reviews require review" do
    incomplete = @patient.allergies.create!(practice: @practice)
    assert incomplete.data_status_incomplete?

    get "/api/clinic/patients/#{@patient.id}/care_summary",
      params: { encounter_id: @encounter.id }, headers: @headers

    assert_response :success
    payload = response.parsed_body
    assert_equal "not_recorded", payload.dig("allergies", "state")
    assert_equal "not_recorded", payload.dig("medications", "state")
    assert_equal "not_recorded", payload.dig("care_needs", "state")
    assert_equal "not_recorded", payload.dig("precautions", "state")
    assert_equal true, payload.fetch("review_needed")
    assert_equal %w[allergies medications care_needs], payload.fetch("review_needed_topics")

    get "/api/clinic/patients/#{@patient.id}/care_summary", headers: @headers
    assert_response :success
    assert_nil response.parsed_body.fetch("review_needed")
    assert_nil response.parsed_body.fetch("review_needed_topics")
    assert_equal "not_applicable", response.parsed_body.dig("precautions", "state")
  end

  test "reviewed none is distinct from absent and conflicting review evidence stays review needed" do
    reviewed_at = Time.utc(2026, 9, 1, 14, 10)
    @patient.history_reviews.create!(practice: @practice, encounter: @encounter, topic: "allergies",
      outcome: "none_reported", information_source: "patient", reviewer_membership: @membership,
      reviewed_at: reviewed_at, request_key: "allergies-none")
    @patient.history_reviews.create!(practice: @practice, encounter: @encounter, topic: "medications",
      outcome: "unable_to_obtain", information_source: "caregiver", reviewer_membership: @membership,
      reviewed_at: reviewed_at, request_key: "medications-unavailable")
    @patient.history_reviews.create!(practice: @practice, encounter: @encounter, topic: "care_needs",
      outcome: "none_reported", information_source: "patient", reviewer_membership: @membership,
      reviewed_at: reviewed_at, request_key: "care-needs-none")

    get "/api/clinic/patients/#{@patient.id}/care_summary",
      params: { encounter_id: @encounter.id }, headers: @headers

    assert_response :success
    assert_equal "none_reported", response.parsed_body.dig("allergies", "state")
    assert_equal "none_reported", response.parsed_body.dig("care_needs", "state")
    assert_equal "unable_to_obtain", response.parsed_body.dig("reviews", "medications", "state")
    assert_equal [ "medications" ], response.parsed_body.fetch("review_needed_topics")
  end

  test "care details are encrypted at rest and append only review evidence cannot be rewritten" do
    recorded_at = Time.utc(2026, 9, 1, 14, 5)
    allergy = @patient.allergies.create!(practice: @practice, data_status: "recorded",
      allergen_name: "Synthetic protected allergen", reaction: "Synthetic protected reaction",
      category: "other", clinical_status: "active", verification_status: "unconfirmed",
      criticality: "unable_to_assess", severity: "unknown", recorded_by_membership: @membership,
      recorded_at: recorded_at)
    review = @patient.history_reviews.create!(practice: @practice, encounter: @encounter, topic: "allergies",
      outcome: "current_list_confirmed", information_source: "patient", notes: "Synthetic protected review note",
      reviewer_membership: @membership, reviewed_at: recorded_at, request_key: "encrypted-review")

    raw_allergen = ApplicationRecord.connection.select_value(
      "SELECT allergen_name FROM clinic_allergies WHERE id = #{allergy.id.to_i}"
    )
    raw_note = ApplicationRecord.connection.select_value(
      "SELECT notes FROM clinic_patient_history_reviews WHERE id = #{review.id.to_i}"
    )
    assert_not_equal allergy.allergen_name, raw_allergen
    assert_not_equal review.notes, raw_note
    assert_not review.update(outcome: "none_reported")
    assert_equal "current_list_confirmed", review.reload.outcome
  end

  test "foreign patients and wrong-patient encounters cannot be substituted" do
    foreign_organization = Organization.create!(name: "Foreign Synthetic Organization")
    foreign_user = User.create!(email_address: "foreign-care@example.invalid", password: @password)
    foreign_practice = Clinic::Practice.create!(name: "Foreign Synthetic Practice", organization: foreign_organization)
    foreign_membership = foreign_practice.memberships.create!(user: foreign_user)
    grant_permissions!(foreign_membership, "patients.read")
    foreign_patient = foreign_practice.patients.create!(display_name: "Foreign Synthetic Patient", reference: "FOREIGN")
    foreign_encounter = foreign_practice.encounters.create!(patient: foreign_patient,
      started_at: Time.utc(2026, 9, 1, 16), status: "open")

    get "/api/clinic/patients/#{foreign_patient.id}/care_summary", headers: @headers
    assert_response :not_found
    get "/api/clinic/patients/#{@patient.id}/care_summary",
      params: { encounter_id: @other_encounter.id }, headers: @headers
    assert_response :not_found
    get "/api/clinic/patients/#{@patient.id}/care_summary",
      params: { encounter_id: foreign_encounter.id }, headers: @headers
    assert_response :not_found
  end

  test "patient read permission is required" do
    revoke_all_permissions!(@membership)

    get "/api/clinic/patients/#{@patient.id}/care_summary", headers: @headers

    assert_response :forbidden
  end

  test "encounter validation rejects a foreign-patient encounter" do
    get "/api/clinic/patients/#{@patient.id}/care_summary",
      params: { encounter_id: @other_encounter.id }, headers: @headers

    assert_response :not_found
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def submit(path, params = {}, method: :post)
    public_send(method, path, params: params, headers: csrf_headers, as: :json)
  end

  def login(user)
    submit "/api/session", { email_address: user.email_address, password: @password }
    assert_response :success
  end
end
