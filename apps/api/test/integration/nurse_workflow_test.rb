require "test_helper"

class NurseWorkflowTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic Nurse Workflow Organization")
    @practice = Clinic::Practice.create!(name: "Synthetic Nurse Workflow Practice", organization:, timezone: "UTC")
    @site = @practice.sites.create!(code: "NURSE")
    @user = User.create!(email_address: "nurse-workflow@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "intake.write", "notes.write", "encounters.write")
    @clinician = User.create!(email_address: "nurse-workflow-clinician@example.invalid", password: @password)
    @clinician_membership = @practice.memberships.create!(user: @clinician)
    grant_permissions!(@clinician_membership, "patients.read", "notes.write", "encounters.write")
    @patient = @practice.patients.create!(display_name: "Synthetic Nurse Patient", reference: "NURSE-001")
    @other_patient = @practice.patients.create!(display_name: "Synthetic Other Patient", reference: "NURSE-002")
    @encounter = @practice.encounters.create!(patient: @patient, site: @site,
      started_at: Time.utc(2026, 9, 10, 14), status: "open")
    @reviews = %w[allergies medications care_needs].map.with_index do |topic, index|
      @patient.history_reviews.create!(practice: @practice, encounter: @encounter, topic:,
        outcome: "current_list_confirmed", information_source: "patient", reviewer_membership: @membership,
        reviewed_at: Time.utc(2026, 9, 10, 14, index + 1), request_key: "nurse-review-#{topic}")
    end
    login
  end

  test "intake handoff and task lifecycle is durable isolated and replay safe" do
    path = workspace_path(@patient, @encounter)
    get path, headers: @headers
    assert_response :success
    assert_nil response.parsed_body.fetch("intake")
    assert_equal "nurse-workspace-v1", response.parsed_body.fetch("schema_version")
    assert_equal 1, response.parsed_body.dig("questionnaire_form", "version")
    assert_includes response.parsed_body.dig("questionnaire_form", "fields").map { |field| field.fetch("id") },
      "telehealth_location"
    assert_includes response.parsed_body.dig("questionnaire_form", "provenance"), "staff_recorded"
    assert_equal false, response.parsed_body.dig("capabilities", "observations_write")

    incomplete_evidence = ready_intake(request_key: "nurse-intake-missing-history",
      history_review_ids: [ @reviews.first.id ])
    post intake_path, params: incomplete_evidence, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal 0, Clinic::EncounterIntakeRevision.where(encounter: @encounter).count

    request = ready_intake(request_key: "nurse-intake-ready", history_review_ids: @reviews.map(&:id))
    assert_difference "Clinic::EncounterIntakeRevision.count", 1 do
      post intake_path, params: request, headers: csrf_headers, as: :json
      assert_response :created
    end
    intake = response.parsed_body.fetch("intake")
    assert_equal "ready_for_handoff", intake.fetch("status")
    assert_equal @reviews.map(&:id).sort, intake.fetch("history_review_ids").sort

    assert_no_difference "Clinic::EncounterIntakeRevision.count" do
      post intake_path, params: request, headers: csrf_headers, as: :json
      assert_response :created
    end
    altered = ready_intake(request_key: "nurse-intake-ready", history_review_ids: @reviews.map(&:id))
    altered[:intake][:status] = "incomplete"
    post intake_path, params: altered, headers: csrf_headers, as: :json
    assert_response :conflict

    stale = ready_intake(request_key: "nurse-intake-stale", history_review_ids: @reviews.map(&:id))
    post intake_path, params: stale, headers: csrf_headers, as: :json
    assert_response :conflict

    handoff_request = { handoff: { intake_revision_id: intake.fetch("id"), request_key: "nurse-handoff-request" } }
    assert_difference [ "Clinic::EncounterHandoff.count", "Clinic::ClinicalTask.count" ], 1 do
      post handoffs_path, params: handoff_request, headers: csrf_headers, as: :json
      assert_response :created
    end
    handoff = response.parsed_body.fetch("handoff")
    assert_equal "pending", handoff.fetch("state")
    assert_no_difference [ "Clinic::EncounterHandoff.count", "Clinic::ClinicalTask.count" ] do
      post handoffs_path, params: handoff_request, headers: csrf_headers, as: :json
      assert_response :created
    end

    patch "/api/clinic/handoffs/#{handoff.fetch('id')}", params: {
      handoff: { action: "accept", expected_version: handoff.fetch("version"), request_key: "nurse-self-handoff-accept" }
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    login(@clinician)
    patch "/api/clinic/handoffs/#{handoff.fetch('id')}", params: {
      handoff: { action: "accept", expected_version: handoff.fetch("version"), request_key: "nurse-handoff-accept" }
    }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "accepted", response.parsed_body.dig("handoff", "state")
    assert_equal "completed", Clinic::ClinicalTask.find_by!(source_type: "handoff", source_id: handoff.fetch("id")).state
    assert_equal "clinician", Clinic::Care::NurseWorkflow.board_snapshot([ @encounter ]).dig(@encounter.id, :stage)

    task_request = { task: { request_key: "nurse-task-create", task_kind: "patient_call", pool_code: "clinical" } }
    post tasks_path, params: task_request, headers: csrf_headers, as: :json
    assert_response :created
    task = response.parsed_body.fetch("task")
    worklist = Clinic::Operations::FollowUpWorklist.call(practice: @practice, actor: @user, site_id: @site.id)
    assert_includes worklist.fetch(:clinical_tasks).pluck(:id), task.fetch("id")
    %w[claim start].each do |action|
      patch_task(task, action)
      task = response.parsed_body.fetch("task")
    end
    patch_task(task, "complete", resolution_code: "completed")
    assert_equal [ "completed", "completed" ], response.parsed_body.fetch("task").values_at("state", "resolution_code")

    get path, headers: @headers
    assert_response :success
    assert_equal "accepted", response.parsed_body.dig("handoff", "state")
    assert_equal 2, response.parsed_body.fetch("tasks").length

    get workspace_path(@other_patient, @encounter), headers: @headers
    assert_response :not_found

    revision = Clinic::EncounterIntakeRevision.find(intake.fetch("id"))
    assert_raises ActiveRecord::StatementInvalid do
      revision.update_column(:status, "incomplete")
    end
  end

  test "correction request can be cancelled revised and handed off again" do
    initial = ready_intake(request_key: "nurse-correction-intake", history_review_ids: @reviews.map(&:id))
    post intake_path, params: initial, headers: csrf_headers, as: :json
    assert_response :created
    first_intake = response.parsed_body.fetch("intake")

    post handoffs_path, params: { handoff: {
      intake_revision_id: first_intake.fetch("id"), request_key: "nurse-correction-handoff"
    } }, headers: csrf_headers, as: :json
    assert_response :created
    first_handoff = response.parsed_body.fetch("handoff")

    login(@clinician)
    patch "/api/clinic/handoffs/#{first_handoff.fetch('id')}", params: { handoff: {
      action: "request_correction", expected_version: first_handoff.fetch("version"),
      request_key: "nurse-correction-request"
    } }, headers: csrf_headers, as: :json
    assert_response :success
    correction = response.parsed_body.fetch("handoff")
    assert_equal "correction_requested", correction.fetch("state")

    login
    patch "/api/clinic/handoffs/#{first_handoff.fetch('id')}", params: { handoff: {
      action: "cancel", expected_version: correction.fetch("version"), request_key: "nurse-correction-cancel"
    } }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "cancelled", response.parsed_body.dig("handoff", "state")

    revised = ready_intake(request_key: "nurse-correction-revised", history_review_ids: @reviews.map(&:id),
      expected_version: first_intake.fetch("version"))
    post intake_path, params: revised, headers: csrf_headers, as: :json
    assert_response :created
    second_intake = response.parsed_body.fetch("intake")

    assert_difference "Clinic::EncounterHandoff.count", 1 do
      post handoffs_path, params: { handoff: {
        intake_revision_id: second_intake.fetch("id"), request_key: "nurse-correction-rehandoff"
      } }, headers: csrf_headers, as: :json
      assert_response :created
      assert_equal "pending", response.parsed_body.dig("handoff", "state")
    end
  end

  test "walk in intake preserves encrypted staff drafts without impersonating patient confirmation" do
    assert_nil @encounter.appointment_id
    questionnaire = { text: "Synthetic staff-assisted goals", status: "draft", confirmed: false, confirmed_chunks: [ 0, 2 ],
      answers: { goals: { state: "answered", value: "Discuss prior approaches" }, allergies: { state: "unknown", value: "" } } }
    request = { intake: { request_key: "journey-staff-draft", expected_version: 0, status: "incomplete",
      identity_state: "not_confirmed", visit_reason_state: "not_recorded", history_state: "not_recorded",
      vitals_state: "not_recorded", observation_ids: [], history_review_ids: [], questionnaire: questionnaire } }
    post intake_path, params: request, headers: csrf_headers, as: :json
    assert_response :created
    first = response.parsed_body.fetch("intake")
    assert_equal "draft", first.dig("questionnaire", "status")
    assert_equal "staff", first.dig("questionnaire", "recorder")
    assert_nil first.dig("questionnaire", "attestation")
    assert_equal false, first.dig("questionnaire", "staff_confirmation")
    assert_equal [ 0, 2 ], first.dig("questionnaire", "confirmed_chunks")
    assert_equal @membership.id, first.fetch("recorded_by_membership_id")
    raw = ApplicationRecord.connection.select_value(
      "SELECT encrypted_questionnaire FROM clinic_encounter_intake_revisions WHERE id = #{Integer(first.fetch('id'))}"
    )
    assert_not_includes raw, "Synthetic staff-assisted goals"
    assert_no_difference "Clinic::EncounterIntakeRevision.count" do
      post intake_path, params: request, headers: csrf_headers, as: :json
      assert_response :created
      assert_equal first, response.parsed_body.fetch("intake")
      post intake_path, params: { intake: request[:intake].merge(request_key: "journey-staff-stale") }, headers: csrf_headers, as: :json
      assert_response :conflict
    end

    rejected = request[:intake].merge(expected_version: 1, request_key: "journey-staff-unconfirmed",
      questionnaire: questionnaire.merge(status: "submitted"))
    post intake_path, params: { intake: rejected }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_difference "Clinic::ClinicalTask.count", 1 do
      post tasks_path, params: { task: { request_key: "journey-staff-independent", task_kind: "patient_call", pool_code: "clinical" } },
        headers: csrf_headers, as: :json
      assert_response :created
    end
    post intake_path, params: { intake: rejected.merge(request_key: "journey-staff-confirmed",
      questionnaire: questionnaire.merge(status: "submitted", confirmed: true)) }, headers: csrf_headers, as: :json
    assert_response :created
    confirmed = response.parsed_body.fetch("intake")
    assert_equal true, confirmed.dig("questionnaire", "staff_confirmation")
    assert_nil confirmed.dig("questionnaire", "attestation")
    assert_equal "incomplete", confirmed.fetch("status")
    assert_equal "not_recorded", confirmed.fetch("history_state")

    post intake_path, params: { intake: request[:intake].except(:questionnaire).merge(expected_version: 2,
      identity_state: "confirmed", request_key: "journey-staff-status-only") }, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal confirmed.fetch("questionnaire"), response.parsed_body.dig("intake", "questionnaire")
    assert_nil @encounter.reload.appointment_id
  end

  test "staff questionnaire write requires intake permission and the exact encounter patient" do
    request = { intake: { request_key: "journey-staff-denied", expected_version: 0, status: "incomplete",
      identity_state: "not_confirmed", visit_reason_state: "not_recorded", history_state: "not_recorded",
      vitals_state: "not_recorded", observation_ids: [], history_review_ids: [],
      questionnaire: { text: "Synthetic draft", answers: {}, status: "draft", confirmed: false } } }
    assert_no_difference "Clinic::EncounterIntakeRevision.count" do
      post "/api/clinic/patients/#{@other_patient.id}/encounters/#{@encounter.id}/intake_revisions",
        params: request, headers: csrf_headers, as: :json
      assert_response :not_found
      login(@clinician)
      post intake_path, params: request, headers: csrf_headers, as: :json
      assert_response :forbidden
    end
    login
    post intake_path, params: request, headers: csrf_headers, as: :json
    assert_response :created
  end

  private

  def workspace_path(patient, encounter)
    "/api/clinic/patients/#{patient.id}/encounters/#{encounter.id}/nurse_workspace"
  end

  def intake_path
    "/api/clinic/patients/#{@patient.id}/encounters/#{@encounter.id}/intake_revisions"
  end

  def handoffs_path
    "/api/clinic/patients/#{@patient.id}/encounters/#{@encounter.id}/handoffs"
  end

  def tasks_path
    "/api/clinic/patients/#{@patient.id}/encounters/#{@encounter.id}/clinical_tasks"
  end

  def ready_intake(request_key:, history_review_ids:, expected_version: 0)
    { intake: { request_key:, expected_version:, status: "ready_for_handoff", identity_state: "confirmed",
      visit_reason_state: "confirmed", history_state: "reviewed", vitals_state: "not_applicable",
      observation_ids: [], history_review_ids: } }
  end

  def patch_task(task, action, resolution_code: nil)
    patch "/api/clinic/clinical_tasks/#{task.fetch('id')}", params: {
      task: { action:, expected_version: task.fetch("version"), request_key: "nurse-task-#{action}", resolution_code: }
    }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def login(user = @user)
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
