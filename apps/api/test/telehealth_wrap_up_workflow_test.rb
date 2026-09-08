require "test_helper"
require "digest"

class TelehealthWrapUpWorkflowTest < ActionDispatch::IntegrationTest
  PASSWORD = "Telehealth-wrap-up-2026!".freeze

  setup do
    @rails_environment = Rails.env
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @environment = { "APP_DEVELOPMENT_LOGIN" => ENV["APP_DEVELOPMENT_LOGIN"] }
    ENV["APP_DEVELOPMENT_LOGIN"] = "1"

    @practice = Clinic::Practice.create!(name: "Telehealth Wrap-up Practice", timezone: "America/Chicago")
    @staff = User.create!(email_address: "wrap-up-clinician@example.invalid", password: PASSWORD)
    @membership = @practice.memberships.create!(user: @staff)
    grant_permissions!(@membership, "telehealth.read", "telehealth.host", "telehealth.participate",
      "encounters.write", "notes.read", "notes.write", "notes.sign", "scribe.read")
    @site = @practice.sites.create!(code: "WRAP", name: "Wrap-up Site", status: "active",
      address_line1: "100 Clinic Way", city: "Austin", state: "TX", postal_code: "78701", country: "US")
    @patient = @practice.patients.create!(display_name: "Wrap-up Patient", reference: "WRAP-001")
    @patient_user = User.create!(email_address: Development::TestAccounts::PROFILES.dig("patient", :email),
      password: Development::TestAccounts.send(:password_for, "patient"))
    @identity = Clinic::PatientPortal::Identity.create!(practice: @practice, patient: @patient,
      user: @patient_user, status: :active, invited_at: 1.day.ago, activated_at: 1.day.ago)
    @clinician = @practice.clinician_profiles.create!(membership: @membership,
      display_name: "Wrap-up Clinician", reference: "WRAP-CLINICIAN")
    @appointment = @practice.appointments.create!(practice: @practice, patient: @patient, site: @site,
      booked_clinician: @clinician, starts_at: 30.minutes.ago, ends_at: 30.minutes.from_now,
      status: "confirmed", visit_modality: "video")
    @encounter = @practice.encounters.create!(patient: @patient, appointment: @appointment, site: @site,
      started_at: 25.minutes.ago, status: "in_progress")
    @policy = create_policy
    @visit = Clinic::Telehealth::Visit.create!(practice: @practice, patient: @patient,
      appointment: @appointment, encounter: @encounter, policy_version: @policy,
      status: "in_progress", access_generation: 1, first_started_at: 20.minutes.ago,
      created_by_membership: @membership)
    @visit.participants.create!(practice: @practice, role: "clinician", membership: @membership,
      status: "admitted", admitted_by_membership: @membership, admitted_at: 20.minutes.ago,
      admitted_generation: @visit.access_generation)
    @visit.participants.create!(practice: @practice, role: "patient", portal_identity: @identity, status: "left")
    login(@staff)
  end

  teardown do
    Rails.env = @rails_environment
    @environment.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end

  test "HTTP draft is encrypted idempotent version-fenced and private from patients and unprivileged staff" do
    draft = wrap_up_input(patient_instructions: "Private unsigned next steps.", clinician_notes: "Private clinician context.")
    original_version = @visit.lock_version

    post save_path, params: { request_key: "wrap-up-no-csrf", expected_version: original_version,
      wrap_up: draft }, headers: @headers, as: :json
    assert_response :unprocessable_entity
    assert_nil @visit.wrap_up

    headers = csrf_headers
    post save_path, params: { request_key: "wrap-up-save-once", expected_version: original_version,
      wrap_up: draft }, headers: headers, as: :json
    assert_response :success
    saved = response.parsed_body
    assert_equal "draft", saved.dig("data", "visit", "wrap_up", "status")
    assert_equal "Private unsigned next steps.", saved.dig("data", "visit", "wrap_up", "patient_instructions")
    assert_includes saved.dig("data", "visit", "wrap_up_options", "blockers"), "visit_not_ended"
    committed_version = saved.fetch("version")
    assert_operator committed_version, :>, original_version
    assert_equal 1, Clinic::Telehealth::WrapUp.where(visit: @visit).count

    raw = ApplicationRecord.connection.select_one(<<~SQL.squish)
      SELECT clinician_notes, patient_instructions, follow_up_plan
      FROM clinic_telehealth_wrap_ups WHERE id = #{Integer(Clinic::Telehealth::WrapUp.find_by!(visit: @visit).id)}
    SQL
    assert_not_equal "Private clinician context.", raw.fetch("clinician_notes")
    assert_not_equal "Private unsigned next steps.", raw.fetch("patient_instructions")

    post save_path, params: { request_key: "wrap-up-save-once", expected_version: original_version,
      wrap_up: draft }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal committed_version, response.parsed_body.fetch("version")
    assert_equal 1, Clinic::Telehealth::WrapUp.where(visit: @visit).count

    post save_path, params: { request_key: "wrap-up-stale", expected_version: original_version,
      wrap_up: draft.merge(outcome: "technical_failure") }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "stale_record", response.parsed_body.fetch("code")

    viewer = User.create!(email_address: "wrap-up-viewer@example.invalid", password: PASSWORD)
    viewer_membership = @practice.memberships.create!(user: viewer)
    grant_permissions!(viewer_membership, "telehealth.read")
    login(viewer)
    get visit_path, headers: @headers
    assert_response :success
    assert_nil response.parsed_body.dig("data", "wrap_up")
    assert_not_includes response.body, "Private clinician context."
    post save_path, params: { request_key: "wrap-up-denied", expected_version: committed_version,
      wrap_up: draft }, headers: csrf_headers, as: :json
    assert_response :forbidden

    login_patient
    get patient_visit_path, headers: @headers
    assert_response :success
    assert_nil response.parsed_body.dig("data", "completion")
    assert_not_includes response.body, "Private unsigned next steps."
    assert_not_includes response.body, "Private clinician context."

    other_patient = @practice.patients.create!(display_name: "Other Patient", reference: "WRAP-OTHER")
    other_appointment = @practice.appointments.create!(patient: other_patient, site: @site,
      starts_at: 1.day.from_now, ends_at: 1.day.from_now + 30.minutes, status: "scheduled", visit_modality: "video")
    other_visit = Clinic::Telehealth::Visit.create!(practice: @practice, patient: other_patient,
      appointment: other_appointment, policy_version: @policy, status: "scheduled",
      created_by_membership: @membership)
    get "/api/patient_portal/telehealth/visits/#{other_visit.public_id}", headers: @headers
    assert_response :not_found
  end

  test "finalization requires confirmed media end signed exact instructions actual Scribe disposition and a real follow-up" do
    note, revision = signed_note("Continue hydration and call for worsening symptoms.")
    follow_up = @practice.appointments.create!(patient: @patient, site: @site,
      booked_clinician: @clinician, starts_at: 2.days.from_now, ends_at: 2.days.from_now + 30.minutes,
      status: "scheduled", visit_modality: "video")
    scribe = Clinic::Scribe::Encounter.create!(practice: @practice, patient: @patient, site: @site,
      clinical_encounter: @encounter, created_by: @staff, status: "consented", consent_status: "accepted",
      template_id: "soap", template_version: 1, retention_class: "clinical_draft")
    @visit.update!(scribe_encounter: scribe)

    get visit_path, headers: @headers
    assert_response :success
    options = response.parsed_body.dig("data", "wrap_up_options")
    assert_equal [ revision.id ], options.fetch("instruction_revisions").pluck("id")
    assert_equal [ follow_up.id ], options.fetch("follow_up_appointments").pluck("id")

    reviewed_input = wrap_up_input(instruction_note_revision_id: revision.id,
      patient_instructions: "client value is replaced by the signed revision", follow_up_status: "arranged",
      follow_up_plan: "A follow-up visit is scheduled.", follow_up_appointment_id: follow_up.id,
      scribe_review_status: "reviewed")
    post save_path, params: { request_key: "wrap-up-gated-save", expected_version: @visit.reload.lock_version,
      wrap_up: reviewed_input }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "Continue hydration and call for worsening symptoms.",
      response.parsed_body.dig("data", "visit", "wrap_up", "patient_instructions")

    post finalize_path, params: { request_key: "wrap-up-active-finalize",
      expected_version: response.parsed_body.fetch("version") }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal "wrap_up_not_ready", response.parsed_body.fetch("code")
    assert_match(/visit_not_ended/, response.parsed_body.fetch("error"))
    assert_match(/scribe_review_mismatch/, response.parsed_body.fetch("error"))

    @visit.reload.update!(status: "ended", last_ended_at: Time.current)
    post save_path, params: { request_key: "wrap-up-deferred-save", expected_version: @visit.reload.lock_version,
      wrap_up: reviewed_input.merge(scribe_review_status: "deferred") }, headers: csrf_headers, as: :json
    assert_response :success
    finalized_from_version = response.parsed_body.fetch("version")
    post finalize_path, params: { request_key: "wrap-up-finalize", expected_version: finalized_from_version },
      headers: csrf_headers, as: :json
    assert_response :success
    wrap_up = @visit.reload.wrap_up
    assert_predicate wrap_up, :finalized?
    assert_equal scribe.id, wrap_up.scribe_encounter_id
    assert_equal "consented", wrap_up.scribe_encounter_status
    assert_equal revision.id, wrap_up.instruction_note_revision_id
    assert_equal note.id, wrap_up.instruction_note_id
    assert_equal follow_up.id, wrap_up.follow_up_appointment_id
    assert_equal "awaiting_encounter_close", response.parsed_body.dig("data", "visit", "wrap_up", "publication_state")

    assert_raises(ActiveRecord::RecordInvalid) { wrap_up.update!(follow_up_plan: "Changed") }
    assert_raises(ActiveRecord::StatementInvalid) do
      Clinic::Telehealth::WrapUp.transaction(requires_new: true) { wrap_up.update_column(:outcome, "technical_failure") }
    end

    login_patient
    get patient_visit_path, headers: @headers
    assert_response :success
    assert_equal "pending", response.parsed_body.dig("data", "completion", "status")
    assert_nil response.parsed_body.dig("data", "completion", "instructions")

    login(@staff)
    Clinic::Scheduling::CloseEncounter.call(encounter: @encounter.reload, actor: @staff,
      request_key: "wrap-up-close-encounter")
    login_patient
    get patient_visit_path, headers: @headers
    assert_response :success
    completion = response.parsed_body.dig("data", "completion")
    assert_equal "ready", completion.fetch("status")
    assert_equal "Continue hydration and call for worsening symptoms.", completion.fetch("instructions")
    assert_equal "arranged", completion.fetch("follow_up_status")
    assert_equal follow_up.id, completion.dig("follow_up_appointment", "id")
    assert_not_includes response.body, "Private clinician context."
    assert_not response.parsed_body.dig("data").key?("wrap_up")
  end

  test "a later signed correction blocks stale completion and revoked portal access stays denied" do
    note, revision = signed_note("Original signed directions.")
    @visit.update!(status: "ended", last_ended_at: Time.current)
    input = wrap_up_input(instruction_note_revision_id: revision.id,
      patient_instructions: "Original signed directions.", scribe_review_status: "not_used")
    post save_path, params: { request_key: "wrap-up-correction-save", expected_version: @visit.lock_version,
      wrap_up: input }, headers: csrf_headers, as: :json
    assert_response :success
    post finalize_path, params: { request_key: "wrap-up-correction-finalize",
      expected_version: response.parsed_body.fetch("version") }, headers: csrf_headers, as: :json
    assert_response :success
    Clinic::Scheduling::CloseEncounter.call(encounter: @encounter.reload, actor: @staff,
      request_key: "wrap-up-correction-close")

    login_patient
    get patient_visit_path, headers: @headers
    assert_equal "ready", response.parsed_body.dig("data", "completion", "status")
    assert_includes response.body, "Original signed directions."

    login(@staff)
    correction = Clinic::Care::CorrectEncounterNote.call(note: note, actor: @staff,
      encrypted_body: correction_payload(revision, patient_instructions: "Corrected signed directions."),
      corrected_revision_id: revision.id, expected_revision: revision.revision_no,
      request_key: "wrap-up-signed-correction")
    Clinic::Care::SignEncounterNote.call(note: note, actor: @staff, revision_no: correction.revision_no,
      content_digest: Digest::SHA256.hexdigest(correction.encrypted_body), attestation_version: "wrap-up-v1")

    login_patient
    get patient_visit_path, headers: @headers
    assert_response :success
    assert_equal "pending", response.parsed_body.dig("data", "completion", "status")
    assert_not_includes response.body, "Original signed directions."
    assert_not_includes response.body, "Corrected signed directions."

    @identity.update!(status: "revoked", revoked_at: Time.current)
    get patient_visit_path, headers: @headers
    assert_response :forbidden
  end

  private

  def create_policy
    setting = Clinic::Telehealth::Setting.create!(practice: @practice, updated_by_membership: @membership,
      provider_code: "daily", enabled: false, health_status: "unconfigured")
    policy = setting.policy_versions.create!(practice: @practice, version: 1, status: "published",
      consent_title: "Video visit consent", consent_body: "Allow treatment by video.",
      content_digest: Digest::SHA256.hexdigest("wrap-up-video-policy"), locale: "en-US",
      patient_instructions: "Prepare for the visit.", support_label: "Clinic support",
      join_early_minutes: 15, join_late_minutes: 30, max_room_minutes: 60, grant_ttl_seconds: 120,
      checkin_max_age_minutes: 120, allow_audio_only: true, allow_staff_screen_share: false,
      scribe_enabled: false, require_location: false, require_callback: false,
      created_by_membership: @membership, published_by_membership: @membership, published_at: 1.minute.ago)
    setting.update!(active_policy_version: policy)
    policy
  end

  def signed_note(instructions)
    note = Clinic::Care::CreateEncounterNote.call(practice: @practice, actor: @staff, encounter: @encounter,
      encrypted_body: soap_payload(instructions), request_key: "wrap-up-note-#{SecureRandom.uuid}", note_kind: "soap")
    revision = note.revisions.sole
    Clinic::Care::SignEncounterNote.call(note: note, actor: @staff, revision_no: revision.revision_no,
      content_digest: Digest::SHA256.hexdigest(revision.encrypted_body), attestation_version: "wrap-up-v1")
    [ note, revision ]
  end

  def soap_payload(instructions)
    Clinic::Care::SoapNotePayload.dump(template_id: "adult-physical-exam-detailed", template_version: 1,
      sections: { subjective: "History", objective: "Exam", assessment: "Assessment", plan: "Plan" },
      patient_instructions: instructions)
  end

  def correction_payload(revision, patient_instructions:)
    Clinic::Care::SoapNotePayload.dump_correction(template_id: "adult-physical-exam-detailed", template_version: 1,
      sections: { subjective: "Corrected history", objective: "Exam", assessment: "Assessment", plan: "Plan" },
      corrected_revision_id: revision.id, corrected_revision_no: revision.revision_no,
      reason: "Correct patient directions", patient_instructions: patient_instructions)
  end

  def wrap_up_input(patient_instructions: "Draft directions.", clinician_notes: "Private clinician context.",
    instruction_note_revision_id: nil, follow_up_status: "none", follow_up_plan: "",
    follow_up_appointment_id: nil, scribe_review_status: "not_used")
    {
      outcome: "completed", clinician_notes: clinician_notes, patient_instructions: patient_instructions,
      instruction_note_revision_id: instruction_note_revision_id, follow_up_status: follow_up_status,
      follow_up_plan: follow_up_plan, follow_up_appointment_id: follow_up_appointment_id,
      scribe_review_status: scribe_review_status
    }
  end

  def visit_path
    "/api/clinic/telehealth/visits/#{@visit.public_id}"
  end

  def save_path
    "#{visit_path}/save_wrap_up"
  end

  def finalize_path
    "#{visit_path}/finalize_wrap_up"
  end

  def patient_visit_path
    "/api/patient_portal/telehealth/visits/#{@visit.public_id}"
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: PASSWORD },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def login_patient
    Rails.env = "development"
    post "/api/development_session", params: { profile: "patient" }, headers: csrf_headers, as: :json
    assert_response :created
  end
end
