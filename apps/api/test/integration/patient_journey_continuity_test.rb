require "test_helper"

class PatientJourneyContinuityTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @practice = Clinic::Practice.create!(name: "Synthetic Continuity Clinic", timezone: "UTC")
    @site = @practice.sites.create!(code: "CONTINUITY")
    @user, @member = staff("owner")
    @receiver, @receiver_member = staff("receiver")
    @patient = @practice.patients.create!(display_name: "Synthetic Continuity Patient", reference: "CONT-001")
    @encounter = @practice.encounters.create!(patient: @patient, site: @site, started_at: 1.hour.ago, status: "open")
    login(@user)
  end

  test "T04 T10 transfer preserves coverage until current eligible acceptance and replays once" do
    task = task_record(assigned_to_membership: @member)
    transition(task, "claim")
    assert_response :success
    assert_equal "claimed", task.reload.state
    before_transfer = task.lock_version
    transfer = { action: "assign", expected_version: before_transfer, request_key: "continuity-transfer",
      assignee_membership_id: @receiver_member.id }
    2.times do
      patch_task(task, transfer)
      assert_response :success
    end
    assert_equal @member.id, task.reload.assigned_to_membership_id
    assert_equal @receiver_member.id, task.pending_assignee_membership_id
    assert_equal 1, task.events.where(action: "assign").count

    login(@receiver)
    patch_task(task, action: "accept_transfer", expected_version: before_transfer, request_key: "continuity-stale-transfer")
    assert_response :conflict
    assert_equal @member.id, task.reload.assigned_to_membership_id
    transition(task, "accept_transfer")
    assert_response :success
    assert_equal @receiver_member.id, task.reload.assigned_to_membership_id
    assert_nil task.pending_assignee_membership_id
    assert_equal %w[claim assign accept_transfer], task.events.order(:id).pluck(:action)
    assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.transaction(requires_new: true) do
        task.events.first.update_column(:action, "claim")
      end
    end
  end

  test "T10 revoked recipient cannot accept while independent same-patient work continues" do
    task = task_record(state: "claimed", assigned_to_membership: @member)
    independent = task_record(task_kind: "patient_call", pool_code: "front_desk")
    transition(task, "assign", assignee_membership_id: @receiver_member.id)
    assert_response :success
    @receiver_member.update!(active: false)
    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Care::NurseWorkflow.transition_task(practice: @practice, actor: @receiver, task: task.reload,
        action: "accept_transfer", expected_version: task.lock_version, request_key: "revoked-transfer")
    end
    assert_equal @member.id, task.reload.assigned_to_membership_id
    transition(independent, "claim")
    assert_response :success
    transition(independent, "complete", resolution_code: "completed")
    assert_response :success
    assert_equal "completed", independent.reload.state
    assert_equal "claimed", task.reload.state
    assert_equal @receiver_member.id, task.pending_assignee_membership_id
  end

  test "T10 unavailable owner exposes coverage and no eligible coverage is explicit" do
    task = task_record(state: "claimed", assigned_to_membership: @receiver_member)
    @receiver_member.update!(active: false)
    get "/api/clinic/operations/follow_ups", headers: @headers
    assert_response :success
    projected = response.parsed_body.fetch("clinical_tasks").find { |item| item.fetch("id") == task.id }
    assert_equal true, projected.fetch("owner_unavailable")
    assert_match(/unavailable/, projected.fetch("assignment_exception"))
    transition(task, "claim")
    assert_response :success
    assert_equal @member.id, task.reload.assigned_to_membership_id

    observer, = staff("observer", permissions: ["patients.read"])
    login(observer)
    @member.update!(active: false)
    get "/api/clinic/patients/#{@patient.id}/encounters/#{@encounter.id}/nurse_workspace", headers: @headers
    assert_response :success
    projected = response.parsed_body.fetch("tasks").find { |item| item.fetch("id") == task.id }
    assert_match(/No eligible coverage/, projected.fetch("assignment_exception"))
    transition(task, "claim")
    assert_response :forbidden
    assert_equal @member.id, task.reload.assigned_to_membership_id
  end

  test "T10 prerequisite cycles and cross-patient references fail while unrelated work succeeds" do
    waiting = task_record(task_kind: "record_request")
    prerequisite = task_record(task_kind: "patient_call")
    billing = task_record(task_kind: "staff_request", pool_code: "front_desk")
    transition(waiting, "dependencies", dependency_ids: [prerequisite.id])
    assert_response :success
    transition(waiting, "claim")
    assert_response :success
    transition(waiting, "start")
    assert_response :unprocessable_entity
    assert_equal "claimed", waiting.reload.state
    transition(prerequisite, "dependencies", dependency_ids: [waiting.id])
    assert_response :unprocessable_entity
    assert_empty prerequisite.dependencies
    other_patient = @practice.patients.create!(display_name: "Synthetic Other Continuity Patient", reference: "CONT-002")
    other_task = task_record(patient: other_patient, encounter: nil)
    transition(waiting, "dependencies", dependency_ids: [other_task.id])
    assert_response :unprocessable_entity
    assert_equal [prerequisite.id], waiting.dependencies.pluck(:prerequisite_id)

    transition(billing, "claim")
    assert_response :success
    transition(billing, "complete", resolution_code: "completed")
    assert_response :success
    assert_equal "completed", billing.reload.state
    assert_equal "open", prerequisite.reload.state
    transition(prerequisite, "claim")
    assert_response :success
    transition(prerequisite, "complete", resolution_code: "completed")
    assert_response :success
    transition(waiting, "start")
    assert_response :success
    assert_equal "in_progress", waiting.reload.state
  end

  test "T10 database refuses dependency cycles and source task cannot manufacture completion" do
    first = task_record
    second = task_record
    Clinic::ClinicalTaskDependency.create!(practice: @practice, task: first, prerequisite: second)
    assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.transaction(requires_new: true) do
        Clinic::ClinicalTaskDependency.create!(practice: @practice, task: second, prerequisite: first)
      end
    end
    assert_empty second.dependencies
    source_task, handoff = handoff_task
    transition(source_task, "claim")
    assert_response :success
    transition(source_task, "complete", resolution_code: "completed")
    assert_response :unprocessable_entity
    assert_equal "pending", handoff.reload.state
    assert_equal "claimed", source_task.reload.state
    transition(second, "claim")
    assert_response :success
    transition(second, "complete", resolution_code: "completed")
    assert_response :success
  end

  test "T10 stale claim and foreign clinic task cannot replace ownership" do
    task = task_record
    version = task.lock_version
    transition(task, "claim")
    assert_response :success
    login(@receiver)
    patch_task(task, action: "claim", expected_version: version, request_key: "stale-claim")
    assert_response :conflict
    assert_equal @member.id, task.reload.assigned_to_membership_id
    foreign = Clinic::Practice.create!(name: "Synthetic Foreign Continuity Clinic")
    foreign_patient = foreign.patients.create!(display_name: "Synthetic Foreign Patient", reference: "FOREIGN-1")
    foreign_member = foreign.memberships.create!(user: User.create!(email_address: "foreign-continuity@example.invalid", password: @password))
    foreign_task = Clinic::ClinicalTask.create!(practice: foreign, patient: foreign_patient, task_kind: "patient_call",
      pool_code: "front_desk", state: "open", source_type: "manual", recorded_by_membership: foreign_member)
    transition(foreign_task, "claim")
    assert_response :not_found
    assert_equal "open", foreign_task.reload.state
  end

  test "T08 T10 encounter closure preserves independent work source identity and follow-up" do
    grant_permissions!(@member, "clinical_records.read", scope_kind: "site", site: @site)
    handoff_work, = handoff_task
    callback = task_record(task_kind: "patient_call", pool_code: "front_desk")
    records = task_record(task_kind: "record_request", pool_code: "records")
    transition(records, "dependencies", dependency_ids: [callback.id])
    assert_response :success
    follow_up = Clinic::EncounterFollowUp.create!(practice: @practice, patient: @patient, encounter: @encounter,
      source_kind: "in_person", state: "needed", plan: "Synthetic clinician requested follow-up", outcome: "",
      recorded_by_membership: @member, updated_by_membership: @member)
    get "/api/clinic/encounters/#{@encounter.id}/completion?patient_id=#{@patient.id}", headers: @headers
    assert_response :success
    evidence = response.parsed_body.fetch("evidence")
    expected_ids = [handoff_work.id, callback.id, records.id].sort
    post "/api/clinic/encounters/#{@encounter.id}/close", params: { close: {
      patient_id: @patient.id, request_key: "continuity-close", disposition_code: "completed_as_planned",
      instructions_status: "not_required", education_status: "not_required", follow_up_id: follow_up.id,
      follow_up_version: follow_up.lock_version, expected_follow_up_state: "needed",
      expected_education_event_ids: [], expected_open_task_versions: evidence.fetch("open_tasks").map { |item| "#{item.fetch('id')}:#{item.fetch('version')}" },
      open_work_reviewed: true
    } }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "completed", @encounter.reload.status
    assert_equal "needed", follow_up.reload.state
    snapshot = @encounter.completion_review.open_work_snapshot
    assert_equal expected_ids, snapshot.pluck("id").sort
    assert_equal handoff_work.source_id, snapshot.find { |item| item.fetch("id") == handoff_work.id }.fetch("source_id")
    get "/api/clinic/operations/follow_ups", headers: @headers
    assert_response :success
    projected = response.parsed_body.fetch("clinical_tasks")
    assert_equal expected_ids, projected.pluck("id").sort
    assert projected.all? { |item| item.fetch("encounter_href").include?(@encounter.id.to_s) }
    transition(callback, "claim")
    assert_response :success
    transition(callback, "complete", resolution_code: "completed")
    assert_response :success
    assert_equal "open", handoff_work.reload.state
    assert_equal "open", records.reload.state
  end

  test "T05 disconnected video intent saves without media evidence and manual work remains available" do
    clinician = @practice.clinician_profiles.create!(membership: @member, display_name: "Synthetic Continuity Clinician", reference: "CONT-CLINICIAN")
    visit_type = @practice.visit_types.create!(code: "CONT-VIDEO")
    appointment = Clinic::Scheduling::BookAppointment.call(practice: @practice, actor: @user, patient: @patient,
      site: @site, booked_clinician: clinician, visit_type:, starts_at: 1.day.from_now,
      ends_at: 1.day.from_now + 30.minutes, visit_modality: "video", request_key: "disconnected-video")
    assert_equal "video", appointment.reload.visit_modality
    assert_nil appointment.telehealth_visit
    assert_empty Clinic::Telehealth::RoomAttempt.where(practice: @practice)
    assert_empty Clinic::Telehealth::JoinGrant.where(practice: @practice)
    visit = Clinic::Scheduling::CreateEncounter.call(practice: @practice, actor: @user, patient: @patient,
      appointment:, started_at: Time.current)
    assert_equal "open", visit.status
    body = Clinic::Care::SoapNotePayload.dump(template_id: "adult-physical-exam-detailed", template_version: 1,
      sections: { subjective: "Synthetic manual note while video is disconnected", objective: "", assessment: "", plan: "" })
    note = Clinic::Care::CreateEncounterNote.call(practice: @practice, actor: @user, encounter: visit,
      note_kind: "soap", encrypted_body: body, request_key: "disconnected-manual-note")
    assert_equal visit.id, note.encounter_id
    assert_equal "scheduled", appointment.reload.status
    assert_nil visit.ended_at
    assert_empty Clinic::Telehealth::RoomAttempt.where(practice: @practice)
  end

  private

  def staff(label, permissions: %w[patients.read notes.write encounters.write appointments.book])
    user = User.create!(email_address: "continuity-#{label}@example.invalid", password: @password)
    member = @practice.memberships.create!(user:)
    grant_permissions!(member, *permissions)
    [user, member]
  end

  def task_record(**attributes)
    Clinic::ClinicalTask.create!({ practice: @practice, patient: @patient, encounter: @encounter, site: @site,
      task_kind: "staff_request", state: "open", pool_code: "clinical", source_type: "manual",
      recorded_by_membership: @member }.merge(attributes))
  end

  def handoff_task
    intake = Clinic::EncounterIntakeRevision.create!(practice: @practice, patient: @patient, encounter: @encounter,
      recorded_by_membership: @member, version_number: 1, status: "ready_for_handoff", identity_state: "confirmed",
      visit_reason_state: "confirmed", history_state: "reviewed", vitals_state: "not_applicable", recorded_at: Time.current,
      request_key: "continuity-handoff-intake", content_digest: Digest::SHA256.hexdigest("synthetic-intake"))
    handoff = Clinic::EncounterHandoff.create!(practice: @practice, patient: @patient, encounter: @encounter,
      intake_revision: intake, state: "pending", requested_by_membership: @member, requested_at: Time.current)
    [task_record(task_kind: "handoff", source_type: "handoff", source_id: handoff.id), handoff]
  end

  def transition(task, action, **attributes)
    patch_task(task, { action:, expected_version: task.reload.lock_version,
      request_key: "continuity-#{SecureRandom.hex(12)}" }.merge(attributes))
  end

  def patch_task(task, attributes)
    patch "/api/clinic/clinical_tasks/#{task.id}", params: { task: attributes }, headers: csrf_headers, as: :json
  end

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    assert_response :success
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
