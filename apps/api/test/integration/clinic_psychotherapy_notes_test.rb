require "test_helper"
require_relative "../support/scribe_template_helpers"

class ClinicPsychotherapyNotesTest < ActionDispatch::IntegrationTest
  include ScribeTemplateHelpers

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
    grant_permissions!(@membership, "patients.read", "encounters.read", "notes.sign", "notes.read", "notes.write",
      "facilities.write", "scribe.write", "scribe.read")
    @clinician_role = RoleVersion.create!(role_code: "clinician", version: 77)
    @clinician_grant = @membership.role_grants.create!(practice: @practice, role_version: @clinician_role,
      scope_kind: "practice", effective_from: 1.minute.ago, revision: 1)
    @patient = @practice.patients.create!(display_name: "Synthetic Therapy Patient", reference: "THERAPY-001")
    Clinic::Configuration::PracticeFeatures.revise(practice: @practice, site: @site, actor: @membership,
      request_key: "therapy-profile", expected_revision: 0, insurance_workflows_enabled: false,
      clinic_type: "behavioral_health", service_scope: [ "individual_therapy" ], assessment_scope: [], finalize: true)
    visit_id = Clinic::Configuration::PracticeFeatures.snapshot(practice: @practice, site: @site)
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

  test "clinician permission at another site cannot access this protected note" do
    put note_path, params: { psychotherapy_note: { body: "Site-isolated synthetic private content",
      expected_version: 0, request_key: "private-note-site" } }, headers: csrf_headers, as: :json
    assert_response :success

    other_site = @practice.sites.create!(code: "THERAPY-OTHER", status: "active")
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.read")
    grant_permissions!(@membership, "notes.sign", scope_kind: "site", site: other_site)

    get note_path, headers: @headers
    assert_response :forbidden
    refute_includes response.body, "Site-isolated synthetic private content"
    put note_path, params: { psychotherapy_note: { body: "Denied site edit", revision_reason: "Denied",
      expected_version: 1, request_key: "private-note-site-denied" } }, headers: csrf_headers, as: :json
    assert_response :forbidden
    assert_equal 1, Clinic::Care::PsychotherapyNote.where(encounter: @encounter).count
  end

  test "disabled therapy denies first creation but retains originator history amendment and exact replay" do
    note = Clinic::Care::PsychotherapyNotes.save(practice: @practice, actor: @user, encounter: @encounter,
      body: "Retained originator analysis", revision_reason: nil, expected_version: 0, request_key: "private-before-disable")
    version = Clinic::PracticeFeatureVersion.find_by!(practice: @practice, site: @site, revision: 1)
    Clinic::PracticeFeatureVersion.create!(practice: @practice, site: @site, created_by_membership: @membership,
      revision: 2, effective_from: Time.current, request_key: "therapy-disabled-source", content_digest: "a" * 64,
      optional_features: version.optional_features.merge("service_scope" => []))
    appointment = @practice.appointments.create!(patient: @patient, site: @site, visit_type: @appointment.visit_type,
      starts_at: Time.current, ends_at: 1.hour.from_now, status: "scheduled", visit_modality: "in_person")
    first = @practice.encounters.create!(patient: @patient, site: @site, appointment: appointment,
      started_at: Time.current, status: "open")
    assert_raises(ArgumentError) do
      Clinic::Care::PsychotherapyNotes.save(practice: @practice, actor: @user, encounter: first,
        body: "Denied new analysis", revision_reason: nil, expected_version: 0, request_key: "private-after-disable")
    end
    assert_equal note.id, Clinic::Care::PsychotherapyNotes.read(practice: @practice, actor: @user, encounter: @encounter).id
    options = { practice: @practice, actor: @user, encounter: @encounter, body: "Clarified retained analysis",
      revision_reason: "Clarification", expected_version: 1, request_key: "private-amend-after-disable" }
    amended = Clinic::Care::PsychotherapyNotes.save(**options)
    assert_equal amended.id, Clinic::Care::PsychotherapyNotes.save(**options).id
    assert_equal [ 2, 1 ], Clinic::Care::PsychotherapyNotes.history(practice: @practice, actor: @user,
      encounter: @encounter).pluck(:version)
  end

  test "mapped therapy identity cannot unlock first notes at weight unconfigured or custom-name visits" do
    weight = @practice.sites.create!(code: "WEIGHT", status: "active")
    Clinic::Configuration::PracticeFeatures.revise(practice: @practice, site: weight, actor: @membership,
      request_key: "private-weight-profile", expected_revision: 0, insurance_workflows_enabled: false,
      clinic_type: "weight_loss", service_scope: [], assessment_scope: [], finalize: true)
    unconfigured = @practice.sites.create!(code: "UNCONFIGURED", status: "active")
    custom = @practice.visit_types.create!(code: "Individual therapy custom")
    [ [ weight, @appointment.visit_type ], [ unconfigured, @appointment.visit_type ], [ @site, custom ] ].each do |site, visit_type|
      appointment = @practice.appointments.create!(patient: @patient, site:, visit_type:,
        starts_at: Time.current, ends_at: 1.hour.from_now, status: "scheduled", visit_modality: "in_person")
      encounter = @practice.encounters.create!(patient: @patient, site:, appointment:, started_at: Time.current, status: "open")
      assert_no_difference "Clinic::Care::PsychotherapyNote.count" do
        assert_raises(ArgumentError) do
          Clinic::Care::PsychotherapyNotes.save(practice: @practice, actor: @user, encounter:,
            body: "Denied mixed context", revision_reason: nil, expected_version: 0, request_key: SecureRandom.uuid)
        end
      end
    end
  end

  test "private notes are excluded from ordinary releases sources drafts messages and diagnostics" do
    marker = "SyntheticPrivateBoundarySentinel"
    note = Clinic::Care::PsychotherapyNotes.save(practice: @practice, actor: @user, encounter: @encounter,
      body: marker, revision_reason: nil, expected_version: 0, request_key: "private-release-boundary")
    [ "/api/clinic/encounters/#{@encounter.id}/notes",
      "/api/clinic/patients/#{@patient.id}/care_summary?encounter_id=#{@encounter.id}",
      "/api/clinic/patients/#{@patient.id}?encounter_id=#{@encounter.id}",
      "/api/clinic/patients/lookup?q=#{marker}",
      "/api/clinic/working_drafts/soap?patient_id=#{@patient.id}&encounter_id=#{@encounter.id}" ].each do |path|
      get path, headers: @headers
      assert_response :success
      assert_not_includes response.body, marker, path
    end
    @encounter.update!(status: "completed", ended_at: @encounter.started_at + 1.hour)
    assert_empty Clinic::Care::ReleasedVisitInstructions.items(practice: @practice, patient: @patient)
    assert_nil Clinic::Care::ReleasedVisitInstructions.handout(practice: @practice, patient: @patient, encounter: @encounter)
    create_scribe_template_catalog!
    scribe = Clinic::Scribe::Workflow.create_encounter(practice: @practice, actor: @user,
      patient: @patient, site: @site, clinical_encounter: @encounter)
    assert_nil scribe.context_content
    assert_empty scribe.sources
    assert_empty Clinic::Scribe::DocumentationWorklist.call(scribe_scope: @practice.scribe_encounters,
      note_scope: @encounter.notes).fetch(:items)
    assert_raises(ArgumentError) do
      Clinic::Messaging::StaffPolicy.linked_object!(practice: @practice, actor: @user,
        type: "psychotherapy_note", id: note.id)
    end
    get "/api/clinic/working_drafts/psychotherapy?patient_id=#{@patient.id}&encounter_id=#{@encounter.id}", headers: @headers
    assert_response :unprocessable_entity
    filtered = ActiveSupport::ParameterFilter.new(Rails.application.config.filter_parameters).filter(
      "psychotherapy_note" => { "body" => marker, "revision_reason" => marker })
    assert_not_includes filtered.to_json, marker
    assert_not_includes @practice.audit_events.to_a.to_json, marker
    assert_not_includes Clinic::OperationReceipt.where(practice: @practice).to_a.to_json, marker
    versions = Clinic::ModelVersion.where(item_type: "Clinic::Care::PsychotherapyNote", item_id: note.id)
    assert_not_includes versions.to_a.to_json, marker
    assert_not @practice.audit_events.exists?(action_code: "psychotherapy_notes.history")
    Clinic::Care::PsychotherapyNotes.history(practice: @practice, actor: @user, encounter: @encounter)
    assert @practice.audit_events.exists?(action_code: "psychotherapy_notes.history", outcome: "released")
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
