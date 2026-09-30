require "test_helper"

class IntakeAnswerProvenanceTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic Intake Source Organization")
    @practice = Clinic::Practice.create!(name: "Synthetic Intake Source Practice", organization:, timezone: "UTC")
    @site = @practice.sites.create!(code: "SOURCE")
    @patient = @practice.patients.create!(display_name: "Synthetic Source Patient", reference: "SOURCE-001")
    @other_patient = @practice.patients.create!(display_name: "Synthetic Other Source Patient", reference: "SOURCE-002")
    @encounter = @practice.encounters.create!(patient: @patient, site: @site,
      started_at: Time.utc(2026, 9, 30, 10), status: "open")
    @writer, @writer_membership = create_member("writer", "patients.read", "intake.write")
    @second_writer, @second_membership = create_member("second-writer", "patients.read", "intake.write")
    @reader, = create_member("reader", "patients.read")
    @denied, = create_member("denied", "encounters.write")
  end

  test "workspace returns immutable item source and correction reference independently of revision author" do
    login(@writer)
    answers = { goals: { state: "answered", value: "  Synthetic original goal  " }, allergies: { state: "unknown", value: "" } }
    first = save_intake(answers, expected_version: 0, request_key: "source-first")
    first_item = first.dig("questionnaire", "items", "goals")
    assert_equal "Synthetic original goal", first.dig("questionnaire", "answers", "goals", "value")
    assert_equal "  Synthetic original goal  ", first_item.dig("original_response", "value")
    assert_equal @writer_membership.id, first_item.fetch("recorded_by_membership_id")
    assert_equal "unconfirmed", first_item.fetch("confirmation")
    assert_nil first_item["confirmed_at"]
    assert_nil first_item["supersedes_revision_id"]

    login(@second_writer)
    updated = answers.deep_dup
    updated[:goals][:value] = "Synthetic corrected goal"
    second = save_intake(updated, expected_version: 1, request_key: "source-second")
    login(@reader)
    get workspace_path, headers: @headers
    assert_response :success
    saved = response.parsed_body.fetch("intake")
    assert_equal second.fetch("id"), saved.fetch("id")
    assert_equal @second_membership.id, saved.fetch("recorded_by_membership_id")
    goal = saved.dig("questionnaire", "items", "goals")
    assert_equal "goals", goal.dig("question", "id")
    assert_equal first_item.fetch("question"), goal.fetch("question")
    assert_equal @second_membership.id, goal.fetch("recorded_by_membership_id")
    assert_equal first.fetch("id"), goal.fetch("supersedes_revision_id")
    assert_equal "staff_recorded", goal.fetch("source")
    assert_equal "Synthetic corrected goal", goal.dig("original_response", "value")
    assert_equal first.dig("questionnaire", "items", "allergies"), saved.dig("questionnaire", "items", "allergies")
    assert_equal false, response.parsed_body.dig("capabilities", "intake_write")
    original = Clinic::EncounterIntakeRevision.find(first.fetch("id"))
    assert_equal "Synthetic original goal", Clinic::Care::PrevisitIntake.decode(original.encrypted_questionnaire).dig("answers", "goals", "value")
    assert_empty response.parsed_body.fetch("tasks")
  end

  test "source read rejects denied readers and mismatched patient or foreign practice context" do
    login(@writer)
    save_intake({ goals: { state: "answered", value: "Synthetic protected answer" } },
      expected_version: 0, request_key: "source-protected")
    get workspace_path(patient_id: @other_patient.id), headers: @headers
    assert_response :not_found
    refute response.parsed_body.key?("intake")

    foreign_org = Organization.create!(name: "Synthetic Foreign Source Organization")
    foreign_practice = Clinic::Practice.create!(name: "Synthetic Foreign Source Practice", organization: foreign_org, timezone: "UTC")
    foreign_patient = foreign_practice.patients.create!(display_name: "Synthetic Foreign Source Patient", reference: "FOREIGN-SOURCE")
    foreign_site = foreign_practice.sites.create!(code: "FOREIGN-SOURCE")
    foreign_encounter = foreign_practice.encounters.create!(patient: foreign_patient, site: foreign_site,
      started_at: Time.utc(2026, 9, 30, 10), status: "open")
    get workspace_path(patient_id: foreign_patient.id, encounter_id: foreign_encounter.id), headers: @headers
    assert_response :not_found
    refute response.parsed_body.key?("intake")

    login(@denied)
    get workspace_path, headers: @headers
    assert_includes [ 403, 404 ], response.status
    refute response.parsed_body.key?("intake")
    refute_includes response.body, "Synthetic protected answer"
  end

  private

  def create_member(label, *permissions)
    user = User.create!(email_address: "intake-source-#{label}@example.invalid", password: @password)
    membership = @practice.memberships.create!(user:)
    grant_permissions!(membership, *permissions)
    [ user, membership ]
  end

  def workspace_path(patient_id: @patient.id, encounter_id: @encounter.id)
    "/api/clinic/patients/#{patient_id}/encounters/#{encounter_id}/nurse_workspace"
  end

  def save_intake(answers, expected_version:, request_key:)
    value = nil
    assert_no_difference "Clinic::ClinicalTask.count" do
      post "/api/clinic/patients/#{@patient.id}/encounters/#{@encounter.id}/intake_revisions",
        params: { intake: { request_key:, expected_version:, status: "incomplete", identity_state: "not_confirmed",
          visit_reason_state: "not_recorded", history_state: "not_recorded", vitals_state: "not_recorded",
          observation_ids: [], history_review_ids: [], questionnaire: {
            text: "", status: "draft", confirmed: false, confirmed_chunks: [], answers:
          } } }, headers: csrf_headers, as: :json
      assert_response :created
      value = response.parsed_body.fetch("intake")
    end
    value
  end

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    assert_response :success
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
