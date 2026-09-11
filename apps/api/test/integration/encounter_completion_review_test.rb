require "test_helper"
require "digest"

class EncounterCompletionReviewTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Encounter Completion Organization")
    @practice = Clinic::Practice.create!(name: "Encounter Completion Practice", organization:, timezone: "UTC")
    @site = @practice.sites.create!(code: "COMPLETE")
    @user = User.create!(email_address: "encounter-completion@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "clinical_records.read", "encounters.write", "notes.write",
      "notes.sign")
    @patient = @practice.patients.create!(display_name: "Completion Patient", reference: "COMPLETE-001")
    login(@user)
  end

  test "completion atomically preserves exact evidence keeps work open and enters checkout" do
    appointment, encounter = create_visit
    follow_up = create_follow_up(encounter)
    education = create_education(encounter)
    task = create_task(encounter)
    revision = create_signed_instructions(encounter)

    get completion_path(encounter), headers: @headers
    assert_response :success
    checklist = response.parsed_body
    assert_equal "encounter-completion-v1", checklist.fetch("schema_version")
    assert_equal [ follow_up.id, follow_up.lock_version, "not_required" ],
      checklist.fetch("evidence").fetch("follow_up").values_at("id", "version", "status")
    assert_equal revision.id, checklist.dig("evidence", "signed_instruction", "revision_id")
    assert_equal [ education.id ], checklist.dig("evidence", "education_events").pluck("id")
    assert_equal [ [ task.id, task.lock_version, @membership.id ] ],
      checklist.dig("evidence", "open_tasks").map { |item| item.values_at("id", "version", "assigned_to_membership_id") }

    body = completion_body(checklist, request_key: "complete-exact-evidence")
    post close_path(encounter), params: body, headers: csrf_headers, as: :json
    assert_response :success
    first_review = response.parsed_body.fetch("completion_review")

    post close_path(encounter), params: body, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal first_review, response.parsed_body.fetch("completion_review")

    review = Clinic::EncounterCompletionReview.find(first_review.fetch("id"))
    assert_equal [ "completed_as_planned", "provided", "recorded", "not_required" ],
      [ review.disposition_code, review.instructions_status, review.education_status, review.follow_up_state ]
    assert_equal revision.id, review.instruction_note_revision_id
    assert_equal [ education.id ], review.education_event_ids
    assert_equal [ task.id, task.lock_version, @membership.id ],
      review.open_work_snapshot.sole.values_at("id", "version", "assigned_to_membership_id")
    assert_equal "claimed", task.reload.state
    assert_equal "completed", encounter.reload.status
    assert_equal "completed", appointment.reload.status
    assert_equal 1, Clinic::EncounterCompletionReview.where(encounter:).count
    assert_equal [ encounter.id ], Clinic::Billing::Dashboard.call(
      practice: @practice, patient_identity_access: true
    ).dig(:unbilled_encounters, :items).pluck(:encounter_id)
    assert_raises(ActiveRecord::StatementInvalid) do
      Clinic::EncounterCompletionReview.where(id: review.id).update_all(disposition_code: "other")
    end
  end

  test "missing or changed review evidence prevents encounter completion" do
    _appointment, missing_follow_up_encounter = create_visit(offset: 1.day)
    missing = {
      "evidence" => {
        "follow_up" => { "id" => 99_999, "version" => 0, "status" => "not_required" },
        "signed_instruction" => nil, "education_events" => [], "open_tasks" => []
      }
    }
    post close_path(missing_follow_up_encounter), params: completion_body(
      missing, request_key: "complete-without-follow-up", instructions_status: "not_required",
      education_status: "not_required"
    ), headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal "open", missing_follow_up_encounter.reload.status
    assert_not Clinic::EncounterCompletionReview.exists?(encounter: missing_follow_up_encounter)

    _appointment, stale_encounter = create_visit(offset: 2.days)
    create_follow_up(stale_encounter)
    task = create_task(stale_encounter)
    get completion_path(stale_encounter), headers: @headers
    assert_response :success
    stale = response.parsed_body
    task.update!(due_at: 1.day.from_now)

    post close_path(stale_encounter), params: completion_body(
      stale, request_key: "complete-with-stale-task", instructions_status: "not_required",
      education_status: "not_required"
    ), headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "stale_record", response.parsed_body.fetch("code")
    assert_equal "open", stale_encounter.reload.status
    assert_not Clinic::EncounterCompletionReview.exists?(encounter: stale_encounter)
  end

  test "audit failure rolls back review encounter appointment and receipt while read permission remains required" do
    appointment, encounter = create_visit(offset: 3.days)
    create_follow_up(encounter)
    get completion_path(encounter), headers: @headers
    assert_response :success
    body = completion_body(response.parsed_body, request_key: "complete-audit-failure",
      instructions_status: "not_required", education_status: "not_required")

    denied_user = User.create!(email_address: "completion-denied@example.invalid", password: SecureRandom.hex(18))
    denied_membership = @practice.memberships.create!(user: denied_user)
    grant_permissions!(denied_membership, "encounters.write")
    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Scheduling::EncounterCompletion.show(practice: @practice, actor: denied_user, encounter:)
    end

    original_record = Clinic::AuditRecorder.method(:record!)
    Clinic::AuditRecorder.define_singleton_method(:record!) do |practice:, actor:, action_code:, **arguments|
      raise Clinic::AuditRecorder::Unavailable if action_code == "encounters.close"

      original_record.call(practice:, actor:, action_code:, **arguments)
    end
    post close_path(encounter), params: body, headers: csrf_headers, as: :json
    assert_response :service_unavailable
    assert_equal "open", encounter.reload.status
    assert_equal "scheduled", appointment.reload.status
    assert_not Clinic::EncounterCompletionReview.exists?(encounter:)
    assert_not Clinic::OperationReceipt.exists?(practice: @practice, request_key: "complete-audit-failure")
  ensure
    Clinic::AuditRecorder.define_singleton_method(:record!, original_record) if original_record
  end

  private

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def create_visit(offset: 0.days)
    starts_at = 2.hours.ago - offset
    appointment = @practice.appointments.create!(
      patient: @patient, site: @site, starts_at:, ends_at: starts_at + 30.minutes, status: "scheduled"
    )
    encounter = @practice.encounters.create!(
      patient: @patient, appointment:, site: @site, started_at: starts_at, status: "open"
    )
    [ appointment, encounter ]
  end

  def create_follow_up(encounter)
    Clinic::EncounterFollowUp.create!(
      practice: @practice, patient: @patient, encounter:, source_kind: "in_person", state: "not_required",
      plan: "No scheduled follow-up is required.", outcome: "", recorded_by_membership: @membership,
      updated_by_membership: @membership
    )
  end

  def create_education(encounter)
    Clinic::Care::PatientEducationEvent.create!(
      practice: @practice, patient: @patient, encounter:, site: @site, topic_code: "self_care",
      topic_title: "Home care",
      delivery_method: "discussion", recipient: "patient", language: "English", interpreter_used: false,
      teach_back_status: "demonstrated", patient_response: "Patient described the home-care plan.",
      follow_up_needed: false, recorded_by_membership: @membership, recorded_at: Time.current,
      request_key: "completion-education-#{encounter.id}"
    )
  end

  def create_task(encounter)
    Clinic::ClinicalTask.create!(
      practice: @practice, patient: @patient, encounter:, site: @site, task_kind: "record_request",
      state: "claimed",
      pool_code: "records", assigned_to_membership: @membership, source_type: "encounter",
      source_id: encounter.id, recorded_by_membership: @membership
    )
  end

  def create_signed_instructions(encounter)
    body = Clinic::Care::SoapNotePayload.dump(
      template_id: "adult-physical-exam-detailed", template_version: 1,
      sections: { subjective: "Synthetic completion note", objective: "", assessment: "", plan: "" },
      patient_instructions: "Use the reviewed home-care instructions."
    )
    note = Clinic::Care::CreateEncounterNote.call(
      practice: @practice, actor: @user, encounter:, encrypted_body: body,
      request_key: "completion-note-#{encounter.id}", note_kind: "soap"
    )
    revision = note.revisions.sole
    Clinic::Care::SignEncounterNote.call(
      note:, actor: @user, revision_no: revision.revision_no,
      content_digest: Digest::SHA256.hexdigest(revision.encrypted_body), attestation_version: "completion-v1"
    )
    revision
  end

  def completion_body(checklist, request_key:, instructions_status: "provided", education_status: "recorded")
    evidence = checklist.fetch("evidence")
    follow_up = evidence.fetch("follow_up")
    {
      close: {
        patient_id: @patient.id, request_key:, disposition_code: "completed_as_planned",
        instructions_status:, education_status:, follow_up_id: follow_up.fetch("id"),
        follow_up_version: follow_up.fetch("version"), expected_follow_up_state: follow_up.fetch("status"),
        instruction_note_revision_id: instructions_status == "provided" ?
          evidence.dig("signed_instruction", "revision_id") : nil,
        expected_education_event_ids: evidence.fetch("education_events").pluck("id"),
        expected_open_task_versions: evidence.fetch("open_tasks").map { |task| "#{task.fetch('id')}:#{task.fetch('version')}" },
        open_work_reviewed: true, exception_note: nil
      }
    }
  end

  def completion_path(encounter)
    "/api/clinic/encounters/#{encounter.id}/completion?patient_id=#{@patient.id}"
  end

  def close_path(encounter)
    "/api/clinic/encounters/#{encounter.id}/close"
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
