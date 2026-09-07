require "test_helper"

class PatientPortalVisitInstructionsTest < ActionDispatch::IntegrationTest
  setup do
    @previous_environment, @previous_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }

    Development::TestAccounts.prepare!
    @portal_user = User.find_by!(email_address: "synthetic-patient@example.invalid")
    @identity = Clinic::PatientPortal::Identity.available.find_by!(user: @portal_user)
    @practice = @identity.practice
    @patient = @practice.patients.create!(display_name: "Visit Instructions Patient", reference: "VISIT-INSTRUCTIONS")
    @identity.update!(patient: @patient)
    @site = @practice.sites.create!(code: "VISIT-INSTRUCTIONS")
    @clinician_password = SecureRandom.hex(18)
    @clinician = User.create!(email_address: "visit-instructions-clinician@example.invalid", password: @clinician_password)
    @membership = @practice.memberships.create!(user: @clinician)
    grant_permissions!(@membership, "patients.read")
    grant_permissions!(@membership, "notes.read", "notes.write", "notes.sign", scope_kind: "site", site: @site)

    post "/api/development_session", params: { profile: "patient" }, headers: csrf_headers, as: :json
    assert_response :created
  end

  teardown do
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = @previous_environment, @previous_flag
  end

  test "publishes only the owning patients completed signed visits with bounded pagination" do
    older = completed_encounter(patient: @patient, started_at: Time.utc(2026, 8, 1, 9))
    newer = completed_encounter(patient: @patient, started_at: Time.utc(2026, 8, 2, 9))
    create_note(older, instructions: "Older visit directions.", sign: true)
    create_note(newer, instructions: "Newer visit directions.", sign: true)

    open_encounter = @practice.encounters.create!(patient: @patient, site: @site,
      started_at: Time.utc(2026, 8, 3, 9), status: "open")
    create_note(open_encounter, instructions: "Open visit must stay private.", sign: true)
    create_note(completed_encounter(patient: @patient, started_at: Time.utc(2026, 8, 4, 9)),
      instructions: "Unsigned directions must stay private.", sign: false)

    other_patient = @practice.patients.create!(display_name: "Other Visit Patient", reference: "OTHER-VISIT")
    create_note(completed_encounter(patient: other_patient, started_at: Time.utc(2026, 8, 5, 9)),
      instructions: "Another patient's directions.", sign: true)
    create_foreign_note

    get "/api/patient_portal/visit_instructions", params: { page: 1, per_page: 1 }, headers: @headers
    assert_response :success
    assert_equal({ "page" => 1, "per_page" => 1, "total" => 2 }, response.parsed_body.fetch("pagination"))
    assert_equal [{
      "encounter_id" => newer.id,
      "visit_at" => newer.started_at.iso8601(6),
      "signed_at" => newer.notes.sole.signatures.sole.signed_at.iso8601(6),
      "instructions" => "Newer visit directions."
    }], response.parsed_body.fetch("items")
    audit = @practice.audit_events.where(
      action_code: "patient_portal.visit_instructions.read", outcome: "released"
    ).sole
    assert_predicate audit.actor_session_reference, :present?

    get "/api/patient_portal/visit_instructions", params: { page: 2, per_page: 1 }, headers: @headers
    assert_response :success
    assert_equal [older.id], response.parsed_body.fetch("items").map { |item| item.fetch("encounter_id") }

    get "/api/patient_portal/visit_instructions", params: { per_page: 26 }, headers: @headers
    assert_response :bad_request

    @identity.update!(status: "revoked", revoked_at: Time.current)
    get "/api/patient_portal/visit_instructions", headers: @headers
    assert_response :forbidden
  end

  test "keeps signed directions through an unsigned correction then suppresses the signed blank replacement" do
    encounter = completed_encounter(patient: @patient, started_at: Time.utc(2026, 8, 6, 9))
    note = create_note(encounter, instructions: "Continue the original treatment.", sign: true)
    signed_revision = note.revisions.sole
    correction = Clinic::Care::CorrectEncounterNote.call(
      note: note,
      actor: @clinician,
      encrypted_body: correction_payload(signed_revision, patient_instructions: nil),
      corrected_revision_id: signed_revision.id,
      expected_revision: signed_revision.revision_no,
      request_key: "portal-unsigned-correction"
    )

    get "/api/patient_portal/visit_instructions", headers: @headers
    assert_response :success
    assert_equal ["Continue the original treatment."],
      response.parsed_body.fetch("items").map { |item| item.fetch("instructions") }

    Clinic::Care::SignEncounterNote.call(
      note: note,
      actor: @clinician,
      revision_no: correction.revision_no,
      content_digest: Digest::SHA256.hexdigest(correction.encrypted_body),
      attestation_version: "portal-instructions-v1"
    )
    get "/api/patient_portal/visit_instructions", headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("items")
    assert_equal 0, response.parsed_body.dig("pagination", "total")
  end

  test "portal detail uses the released selector and never resurrects or exposes private SOAP content" do
    encounter = completed_encounter(patient: @patient, started_at: Time.utc(2026, 8, 8, 9))
    note = create_note(encounter, instructions: "Continue hydration until follow-up.", sign: true)
    signed_revision = note.revisions.sole
    correction = Clinic::Care::CorrectEncounterNote.call(
      note: note,
      actor: @clinician,
      encrypted_body: correction_payload(signed_revision, patient_instructions: nil),
      corrected_revision_id: signed_revision.id,
      expected_revision: signed_revision.revision_no,
      request_key: "portal-detail-unsigned-correction"
    )

    get portal_detail_path(encounter), headers: @headers
    assert_response :success
    item = response.parsed_body.fetch("item")
    assert_equal %w[encounter_id instructions patient_name practice_name signed_at timezone visit_at], item.keys.sort
    assert_equal [
      encounter.id, "Continue hydration until follow-up.", @patient.display_name, @practice.name, @practice.timezone
    ], item.values_at("encounter_id", "instructions", "patient_name", "practice_name", "timezone")
    %w[Visit\ history Exam Assessment Plan].each { |private_text| assert_not_includes response.body, private_text }

    Clinic::Care::SignEncounterNote.call(
      note: note,
      actor: @clinician,
      revision_no: correction.revision_no,
      content_digest: Digest::SHA256.hexdigest(correction.encrypted_body),
      attestation_version: "portal-instructions-v1"
    )
    get portal_detail_path(encounter), headers: @headers
    assert_response :success
    assert_nil response.parsed_body.fetch("item")

    open_encounter = @practice.encounters.create!(
      patient: @patient, site: @site, started_at: Time.utc(2026, 8, 9, 9), status: "open"
    )
    create_note(open_encounter, instructions: "Open visit directions.", sign: true)
    get portal_detail_path(open_encounter), headers: @headers
    assert_response :success
    assert_nil response.parsed_body.fetch("item")

    unsigned = completed_encounter(patient: @patient, started_at: Time.utc(2026, 8, 10, 9))
    create_note(unsigned, instructions: "Unsigned visit directions.", sign: false)
    get portal_detail_path(unsigned), headers: @headers
    assert_response :success
    assert_nil response.parsed_body.fetch("item")
  end

  test "portal and staff handout routes enforce owning patient tenant and note permissions" do
    encounter = completed_encounter(patient: @patient, started_at: Time.utc(2026, 8, 11, 9))
    create_note(encounter, instructions: "Return in one week.", sign: true)
    other_patient = @practice.patients.create!(display_name: "Other Handout Patient", reference: "OTHER-HANDOUT")
    other_encounter = completed_encounter(patient: other_patient, started_at: Time.utc(2026, 8, 12, 9))
    create_note(other_encounter, instructions: "Private other patient directions.", sign: true)
    foreign_encounter = create_foreign_note.encounter

    get portal_detail_path(other_encounter), headers: @headers
    assert_response :not_found
    get portal_detail_path(foreign_encounter), headers: @headers
    assert_response :not_found

    login_staff
    get staff_handout_path(encounter), headers: @headers
    assert_response :success
    item = response.parsed_body.fetch("item")
    assert_equal "Return in one week.", item.fetch("instructions")
    assert_equal @patient.display_name, item.fetch("patient_name")
    assert_not_includes response.body, "Visit history"
    assert @practice.audit_events.where(action_code: "visit_instructions.read", outcome: "released").exists?

    get staff_handout_path(other_encounter), headers: @headers
    assert_response :not_found
    get staff_handout_path(foreign_encounter, patient: foreign_encounter.patient), headers: @headers
    assert_response :not_found

    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.read")
    get staff_handout_path(encounter), headers: @headers
    assert_response :forbidden
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def portal_detail_path(encounter)
    "/api/patient_portal/visit_instructions/#{encounter.id}"
  end

  def staff_handout_path(encounter, patient: @patient)
    "/api/clinic/patients/#{patient.id}/encounters/#{encounter.id}/visit_instructions"
  end

  def login_staff
    post "/api/session",
      params: { email_address: @clinician.email_address, password: @clinician_password },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def completed_encounter(patient:, started_at:, practice: @practice, site: @site)
    practice.encounters.create!(
      patient: patient, site: site, started_at: started_at,
      ended_at: started_at + 30.minutes, status: "completed"
    )
  end

  def create_note(encounter, instructions:, sign:, actor: @clinician)
    note = Clinic::Care::CreateEncounterNote.call(
      practice: encounter.practice,
      actor: actor,
      encounter: encounter,
      note_kind: "soap",
      encrypted_body: soap_payload(instructions),
      payload_version: Clinic::Care::SoapNotePayload::VERSION,
      request_key: "portal-note-#{encounter.id}"
    )
    if sign
      revision = note.revisions.sole
      Clinic::Care::SignEncounterNote.call(
        note: note,
        actor: actor,
        revision_no: revision.revision_no,
        content_digest: Digest::SHA256.hexdigest(revision.encrypted_body),
        attestation_version: "portal-instructions-v1"
      )
    end
    note
  end

  def soap_payload(instructions)
    Clinic::Care::SoapNotePayload.dump(
      template_id: "adult-physical-exam-detailed",
      template_version: 1,
      sections: { subjective: "Visit history", objective: "Exam", assessment: "Assessment", plan: "Plan" },
      patient_instructions: instructions
    )
  end

  def correction_payload(revision, patient_instructions:)
    Clinic::Care::SoapNotePayload.dump_correction(
      template_id: "adult-physical-exam-detailed",
      template_version: 1,
      sections: { subjective: "Corrected history", objective: "Exam", assessment: "Assessment", plan: "Plan" },
      corrected_revision_id: revision.id,
      corrected_revision_no: revision.revision_no,
      reason: "Remove outdated directions",
      patient_instructions: patient_instructions
    )
  end

  def create_foreign_note
    foreign_practice = Clinic::Practice.create!(name: "Foreign Visit Instructions Practice")
    foreign_patient = foreign_practice.patients.create!(display_name: "Foreign Visit Patient", reference: "FOREIGN-VISIT")
    foreign_site = foreign_practice.sites.create!(code: "FOREIGN-VISIT")
    foreign_actor = User.create!(email_address: "foreign-visit-clinician@example.invalid", password: SecureRandom.hex(18))
    foreign_membership = foreign_practice.memberships.create!(user: foreign_actor)
    grant_permissions!(foreign_membership, "notes.write", "notes.sign", scope_kind: "site", site: foreign_site)
    encounter = completed_encounter(
      patient: foreign_patient, started_at: Time.utc(2026, 8, 7, 9),
      practice: foreign_practice, site: foreign_site
    )
    create_note(encounter, instructions: "Foreign tenant directions.", sign: true, actor: foreign_actor)
  end
end
