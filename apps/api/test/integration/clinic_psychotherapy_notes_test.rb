require "test_helper"

class ClinicPsychotherapyNotesTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic Therapy Organization")
    @practice = Clinic::Practice.create!(name: "Synthetic Therapy Practice", organization:, timezone: "UTC")
    @site = @practice.sites.create!(code: "THERAPY", status: "active")
    @user = User.create!(email_address: "therapy-originator@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "encounters.read", "notes.sign", "notes.read", "facilities.write")
    @clinician_role = RoleVersion.create!(role_code: "clinician", version: 77)
    @clinician_grant = @membership.role_grants.create!(practice: @practice, role_version: @clinician_role,
      scope_kind: "practice", effective_from: 1.minute.ago, revision: 1)
    @patient = @practice.patients.create!(display_name: "Synthetic Therapy Patient", reference: "THERAPY-001")
    Clinic::Configuration::PracticeFeatures.revise(practice: @practice, actor: @membership,
      request_key: "therapy-profile", expected_revision: 0, insurance_workflows_enabled: false,
      clinic_type: "behavioral_health", service_scope: [ "individual_therapy" ], assessment_scope: [])
    visit_id = Clinic::Configuration::PracticeFeatures.snapshot(practice: @practice)
      .dig(:starter_profile, "visits", "individual_therapy", "visit_type_id")
    @appointment = @practice.appointments.create!(patient: @patient, site: @site,
      visit_type_id: visit_id, starts_at: Time.utc(2026, 9, 25, 14), ends_at: Time.utc(2026, 9, 25, 15),
      status: "scheduled", visit_modality: "in_person")
    @encounter = @practice.encounters.create!(patient: @patient, site: @site, appointment: @appointment,
      started_at: Time.utc(2026, 9, 25, 14), status: "open")
    login
  end

  test "originator saves encrypted append-only versions with exact retry and stale denial" do
    path = note_path
    get path, headers: @headers
    assert_response :success
    assert_nil response.parsed_body.fetch("note")

    first = { psychotherapy_note: { body: "Synthetic private conversation analysis\n", expected_version: 0,
      request_key: "private-note-first" } }
    put path, params: first, headers: csrf_headers, as: :json
    assert_response :success
    first_note = response.parsed_body.fetch("note")
    assert_equal 1, first_note.fetch("version")
    assert_equal 1, Clinic::Care::PsychotherapyNote.count
    raw = ApplicationRecord.connection.select_value(
      "SELECT body FROM clinic_psychotherapy_notes WHERE id = #{first_note.fetch('id')}"
    )
    refute_includes raw, "Synthetic private conversation analysis"

    put path, params: first, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal first_note, response.parsed_body.fetch("note")
    assert_equal 1, Clinic::Care::PsychotherapyNote.count

    put path, params: { psychotherapy_note: { body: "Missing revision reason", expected_version: 1,
      request_key: "private-note-no-reason" } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal 1, Clinic::Care::PsychotherapyNote.count

    put path, params: { psychotherapy_note: { body: "Synthetic corrected analysis", revision_reason: "Clarified wording",
      expected_version: 1, request_key: "private-note-second" } }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal 2, response.parsed_body.dig("note", "version")
    get path, headers: @headers
    assert_response :success
    assert_equal [ 2, 1 ], response.parsed_body.fetch("history").map { |row| row.fetch("version") }
    assert_equal "Synthetic private conversation analysis\n", response.parsed_body.fetch("history").last.fetch("body")

    put path, params: { psychotherapy_note: { body: "Stale overwrite", revision_reason: "Stale",
      expected_version: 1, request_key: "private-note-stale" } }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal 2, Clinic::Care::PsychotherapyNote.count

    get "/api/clinic/encounters/#{@encounter.id}/notes", headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("notes")
    get "/api/clinic/encounters/#{@encounter.id}?patient_id=#{@patient.id}", headers: @headers
    assert_response :success
    refute_includes response.body, "Synthetic private conversation analysis"
    refute_includes response.body, "Synthetic corrected analysis"
  end

  test "another authorized clinician cannot read the originator's private revisions" do
    put note_path, params: { psychotherapy_note: { body: "Originator only synthetic content", expected_version: 0,
      request_key: "private-note-originator" } }, headers: csrf_headers, as: :json
    assert_response :success

    other = User.create!(email_address: "therapy-other@example.invalid", password: SecureRandom.hex(18))
    other_member = @practice.memberships.create!(user: other)
    grant_permissions!(other_member, "patients.read", "notes.sign")
    other_member.role_grants.create!(practice: @practice, role_version: @clinician_role,
      scope_kind: "practice", effective_from: 1.minute.ago, revision: 1)

    assert_nil Clinic::Care::PsychotherapyNotes.read(practice: @practice, actor: other, encounter: @encounter)
    assert_empty Clinic::Care::PsychotherapyNotes.history(practice: @practice, actor: other, encounter: @encounter)
  end

  test "wrong role, unrelated visit and revoked clinician grant cannot open or create protected notes" do
    ordinary = @practice.encounters.create!(patient: @patient, site: @site,
      started_at: Time.utc(2026, 9, 26, 14), status: "open")
    get "/api/clinic/encounters/#{ordinary.id}/psychotherapy_note", headers: @headers
    assert_response :unprocessable_entity

    @clinician_grant.update!(revoked_at: Time.current, revision: 2)
    get note_path, headers: @headers
    assert_response :forbidden
    put note_path, params: { psychotherapy_note: { body: "Denied private text", expected_version: 0,
      request_key: "private-note-denied" } }, headers: csrf_headers, as: :json
    assert_response :forbidden
    assert_empty Clinic::Care::PsychotherapyNote.where(practice: @practice)
  end

  private

  def note_path = "/api/clinic/encounters/#{@encounter.id}/psychotherapy_note"

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def login
    post "/api/session", params: { email_address: @user.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end
end
