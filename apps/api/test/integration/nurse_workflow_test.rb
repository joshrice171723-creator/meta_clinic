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
    @room = @practice.rooms.create!(site: @site, code: "NURSE-ROOM")
    Clinic::Scheduling::AssignEncounterRoom.call(
      practice: @practice, actor: @user, encounter: @encounter, room_id: @room.id,
      request_key: "nurse-room-assignment"
    )
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
    assert_equal Clinic::Care::PrevisitIntake::QUESTIONNAIRE_VERSION, response.parsed_body.dig("questionnaire_form", "version")
    assert_equal (0..10).to_a, response.parsed_body.dig("questionnaire_form", "chunks").map { |chunk| chunk.fetch("index") }
    assert_includes response.parsed_body.dig("questionnaire_form", "answer_states"), "not_asked"
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
    questionnaire = { text: "Synthetic staff-assisted goals", status: "draft", confirmed: false, confirmed_chunks: [],
      answers: { goals: { state: "answered", value: "Discuss prior approaches" },
        allergies: { state: "unknown", value: "" }, symptoms: { state: "not_asked", value: "" } } }
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
    assert_equal [], first.dig("questionnaire", "confirmed_chunks")
    assert_equal "not_asked", first.dig("questionnaire", "answers", "symptoms", "state")
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

  test "workspace compares the latest readable prior encounter without crossing patients" do
    previous_encounter = @practice.encounters.create!(patient: @patient, site: @site,
      started_at: Time.utc(2026, 9, 9, 14), status: "completed")
    previous = intake_revision_for(previous_encounter, "prior-comparison", "Earlier synthetic reason",
      Time.utc(2026, 9, 9, 15))
    current = intake_revision_for(@encounter, "current-comparison", "Current synthetic reason",
      Time.utc(2026, 9, 10, 15))
    intake_revision_for(@practice.encounters.create!(patient: @other_patient, site: @site,
      started_at: Time.utc(2026, 9, 11, 14), status: "completed"), "other-patient-comparison",
      "Other patient reason", Time.utc(2026, 9, 11, 15))

    get workspace_path(@patient, @encounter), headers: @headers
    assert_response :success
    comparison = response.parsed_body.fetch("intake_comparison")
    assert_equal "previous_encounter", comparison.dig("source", "kind")
    assert_equal previous_encounter.id, comparison.dig("source", "encounter_id")
    assert_equal current.id, response.parsed_body.dig("intake", "id")
    item = comparison.fetch("items").find { |entry| entry.fetch("id") == "visit_reason" }
    assert_equal [ "Earlier synthetic reason", "Current synthetic reason", true ],
      item.values_at("previous", "current", "changed")
  end

  test "staff intake rejects skipped out of range and unconfirmed groups" do
    base = {
      status: "incomplete", identity_state: "not_confirmed", visit_reason_state: "not_recorded",
      history_state: "not_recorded", vitals_state: "not_recorded", observation_ids: [], history_review_ids: []
    }
    [
      [ "journey-staff-skipped", [ 0, 2 ], "Confirm intake groups in order" ],
      [ "journey-staff-out-of-range", [ 11 ], "outside the supported workflow" ],
      [ "journey-staff-unconfirmed", [ 0 ], "Confirm the current question group" ]
    ].each do |request_key, confirmed_chunks, error_text|
      questionnaire = { text: "", answers: {}, status: "draft", confirmed: false, confirmed_chunks: }
      post intake_path, params: { intake: base.merge(request_key:, expected_version: 0, questionnaire:) },
        headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
      assert_includes response.parsed_body.fetch("error"), error_text
    end
    assert_equal 0, Clinic::EncounterIntakeRevision.where(encounter: @encounter).count
  end

  test "blank confirmed answers and changed previously confirmed groups are rejected without losing draft recovery" do
    base = { status: "incomplete", identity_state: "not_confirmed", visit_reason_state: "not_recorded",
      history_state: "not_recorded", vitals_state: "not_recorded", observation_ids: [], history_review_ids: [] }
    answers = Clinic::Care::PrevisitIntake.fields.to_h { |field| [ field[:id], { state: "not_asked", value: "" } ] }
    questionnaire = { text: "", status: "submitted", confirmed: true, confirmed_chunks: [ 0 ], answers: }
    questionnaire[:answers]["goals"] = { state: "answered", value: "  " }
    post intake_path, params: { intake: base.merge(expected_version: 0, request_key: "blank-confirmed", questionnaire:) },
      headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal 0, Clinic::EncounterIntakeRevision.where(encounter: @encounter).count
    questionnaire[:answers]["goals"] = { state: "unknown", value: "" }
    post intake_path, params: { intake: base.merge(expected_version: 0, request_key: "valid-confirmed", questionnaire:) },
      headers: csrf_headers, as: :json
    assert_response :created
    questionnaire[:answers]["goals"] = { state: "unanswered", value: "" }
    post intake_path, params: { intake: base.merge(expected_version: 1, request_key: "cleared-confirmed", questionnaire:) },
      headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    questionnaire.merge!(status: "draft", confirmed: false, confirmed_chunks: [])
    post intake_path, params: { intake: base.merge(expected_version: 1, request_key: "reopened-draft", questionnaire:) },
      headers: csrf_headers, as: :json
    assert_response :created
    assert_equal [], response.parsed_body.dig("intake", "questionnaire", "confirmed_chunks")
    assert_equal 2, Clinic::EncounterIntakeRevision.where(encounter: @encounter).count
  end

  test "superseded intake cannot be handed off or accepted and cancellation permits current revision recovery" do
    post intake_path, params: ready_intake(request_key: "stale-handoff-first", history_review_ids: @reviews.map(&:id)),
      headers: csrf_headers, as: :json
    assert_response :created
    first = response.parsed_body.fetch("intake")
    post handoffs_path, params: { handoff: { intake_revision_id: first.fetch("id"), request_key: "stale-handoff-request" } },
      headers: csrf_headers, as: :json
    assert_response :created
    handoff = response.parsed_body.fetch("handoff")
    post intake_path, params: ready_intake(request_key: "stale-handoff-second", expected_version: 1, history_review_ids: @reviews.map(&:id)),
      headers: csrf_headers, as: :json
    assert_response :created
    current = response.parsed_body.fetch("intake")
    assert_equal "intake", Clinic::Care::NurseWorkflow.board_snapshot([ @encounter ]).dig(@encounter.id, :stage)
    login(@clinician)
    patch "/api/clinic/handoffs/#{handoff.fetch('id')}", params: { handoff: {
      action: "accept", expected_version: handoff.fetch("version"), request_key: "stale-handoff-accept"
    } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "Intake has changed"
    assert_equal "pending", Clinic::EncounterHandoff.find(handoff.fetch("id")).state
    assert_equal "open", Clinic::ClinicalTask.find_by!(source_type: "handoff", source_id: handoff.fetch("id")).state
    login
    patch "/api/clinic/handoffs/#{handoff.fetch('id')}", params: { handoff: {
      action: "cancel", expected_version: handoff.fetch("version"), request_key: "stale-handoff-cancel"
    } }, headers: csrf_headers, as: :json
    assert_response :success
    post handoffs_path, params: { handoff: { intake_revision_id: first.fetch("id"), request_key: "stale-handoff-old" } },
      headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    post handoffs_path, params: { handoff: { intake_revision_id: current.fetch("id"), request_key: "stale-handoff-current" } },
      headers: csrf_headers, as: :json
    assert_response :created
    assert_equal current.fetch("id"), response.parsed_body.dig("handoff", "intake_revision_id")
  end

  test "repeatable treatment and procedure history preserves structured records" do
    answers = Clinic::Care::PrevisitIntake.fields.to_h do |field|
      [ field.fetch(:id), { state: "not_asked", value: "" } ]
    end
    answers["prior_approaches"] = {
      state: "answered", value: "", entries: [
        { kind: "medication", name: "Synthetic prior medicine", date_precision: "approximate", date_value: "2024",
          duration: "three_to_six_months", outcome: "some_benefit", maintenance: "no", stop_reason: "adverse_effect",
          adverse_effects: "reported", adverse_effect_details: "Synthetic nausea" },
        { kind: "diet_program", name: "Synthetic nutrition program", date_precision: "unknown", date_value: "",
          duration: "unknown", outcome: "unknown", maintenance: "unknown", stop_reason: "unknown", adverse_effects: "none_reported" }
      ]
    }
    answers["procedures"] = {
      state: "answered", value: "", entries: [
        { kind: "surgery", name: "Synthetic prior procedure", date_precision: "exact", date_value: "2023-04-12",
          outcome: "helpful", complication_state: "none_reported" }
      ]
    }
    answers["barriers"] = { state: "not_applicable", value: "" }

    last = nil
    (0..3).each do |chunk|
      post intake_path, params: { intake: {
        request_key: "nurse-history-chunk-#{chunk}", expected_version: chunk,
        status: "incomplete", identity_state: "not_confirmed", visit_reason_state: "not_recorded",
        history_state: "not_recorded", vitals_state: "not_recorded", observation_ids: [], history_review_ids: [],
        questionnaire: { text: "", answers:, status: "submitted", confirmed: true, confirmed_chunks: (0..chunk).to_a }
      } }, headers: csrf_headers, as: :json
      assert_response :created
      last = response.parsed_body.fetch("intake")
    end

    assert_equal 4, last.fetch("version")
    assert_equal "Synthetic prior medicine", last.dig("questionnaire", "answers", "prior_approaches", "entries", 0, "name")
    assert_equal "approximate", last.dig("questionnaire", "answers", "prior_approaches", "entries", 0, "date_precision")
    assert_equal "Synthetic prior procedure", last.dig("questionnaire", "answers", "procedures", "entries", 0, "name")
    assert_includes last.fetch("questionnaire_text"), "Synthetic prior procedure"
  end

  test "structured conditions family history and symptom routing preserve uncertainty" do
    answers = Clinic::Care::PrevisitIntake.fields.to_h do |field|
      [ field.fetch(:id), { state: "not_asked", value: "" } ]
    end
    answers["symptoms"] = {
      state: "answered", value: "", entries: [
        { kind: "dizziness_fainting", name: "Synthetic dizziness episode", date_precision: "unknown",
          review_route: "clinical_review", details: "Synthetic symptom detail" }
      ]
    }
    answers["history"] = {
      state: "answered", value: "", entries: [
        { kind: "metabolic", name: "Synthetic metabolic condition", date_precision: "approximate", date_value: "2022",
          current_status: "current", review_route: "routine_review", managing_clinician: "", details: "Synthetic condition detail" }
      ]
    }
    answers["family_history"] = {
      state: "answered", value: "", entries: [
        { kind: "parent", name: "Synthetic cardiovascular history", date_precision: "unknown",
          certainty: "uncertain", details: "Synthetic family-history detail" }
      ]
    }

    last = nil
    (0..2).each do |chunk|
      post intake_path, params: { intake: {
        request_key: "nurse-m5-chunk-#{chunk}", expected_version: chunk,
        status: "incomplete", identity_state: "not_confirmed", visit_reason_state: "not_recorded",
        history_state: "not_recorded", vitals_state: "not_recorded", observation_ids: [], history_review_ids: [],
        questionnaire: { text: "", answers:, status: "submitted", confirmed: true, confirmed_chunks: (0..chunk).to_a }
      } }, headers: csrf_headers, as: :json
      assert_response :created
      last = response.parsed_body.fetch("intake")
    end

    assert_equal "clinical_review", last.dig("questionnaire", "answers", "symptoms", "entries", 0, "review_route")
    assert_equal "current", last.dig("questionnaire", "answers", "history", "entries", 0, "current_status")
    assert_equal "uncertain", last.dig("questionnaire", "answers", "family_history", "entries", 0, "certainty")
    assert_includes last.fetch("questionnaire_text"), "Synthetic dizziness episode"
    %w[dizziness_fainting clinical_review metabolic current routine_review 2022 parent uncertain unknown].each do |value|
      assert_includes last.fetch("questionnaire_text"), value
    end
  end

  test "medication actual use and allergy intolerance remain distinct" do
    answers = Clinic::Care::PrevisitIntake.fields.to_h do |field|
      [ field.fetch(:id), { state: "not_asked", value: "" } ]
    end
    answers["medications"] = {
      state: "answered", value: "", entries: [
        { kind: "prescribed", name: "Synthetic current medicine", date_precision: "unknown",
          actual_use: "taking", dose_value: "5", dose_unit: "mg", dose_certainty: "known",
          frequency: "once_daily", source: "prescription_record", details: "Synthetic dose detail" },
        { kind: "supplement", name: "Synthetic current supplement", date_precision: "unknown",
          actual_use: "unknown", dose_value: "", dose_unit: "unknown", dose_certainty: "unknown",
          frequency: "unknown", source: "supplement_label", details: "" }
      ]
    }
    answers["allergies"] = {
      state: "answered", value: "", entries: [
        { kind: "intolerance", name: "Synthetic allergy substance", date_precision: "unknown",
          certainty: "uncertain", severity: "unknown", details: "Synthetic reaction detail" }
      ]
    }

    last = nil
    (0..2).each do |chunk|
      post intake_path, params: { intake: {
        request_key: "nurse-m6-chunk-#{chunk}", expected_version: chunk,
        status: "incomplete", identity_state: "not_confirmed", visit_reason_state: "not_recorded",
        history_state: "not_recorded", vitals_state: "not_recorded", observation_ids: [], history_review_ids: [],
        questionnaire: { text: "", answers:, status: "submitted", confirmed: true, confirmed_chunks: (0..chunk).to_a }
      } }, headers: csrf_headers, as: :json
      assert_response :created
      last = response.parsed_body.fetch("intake")
    end

    assert_equal "taking", last.dig("questionnaire", "answers", "medications", "entries", 0, "actual_use")
    assert_equal "prescription_record", last.dig("questionnaire", "answers", "medications", "entries", 0, "source")
    assert_equal "intolerance", last.dig("questionnaire", "answers", "allergies", "entries", 0, "kind")
    assert_equal "uncertain", last.dig("questionnaire", "answers", "allergies", "entries", 0, "certainty")
    ["kind: prescribed", "actual use: taking", "dose value: 5", "dose unit: mg", "frequency: once_daily",
      "source: prescription_record", "kind: intolerance", "certainty: uncertain", "severity: unknown"].each do |value|
      assert_includes last.fetch("questionnaire_text"), value
    end
  end

  test "extended weight management chunks preserve bounded branches and follow-up context" do
    answers = Clinic::Care::PrevisitIntake.fields.to_h do |field|
      [ field.fetch(:id), { state: "not_asked", value: "" } ]
    end
    answers.merge!(
      "treatment_product_class" => { state: "answered", value: "glp1" },
      "pregnancy_status" => { state: "answered", value: "unsure" },
      "pregnancy_plans" => { state: "answered", value: "unknown" },
      "breastfeeding_status" => { state: "declined", value: "" },
      "contraception_context" => { state: "answered", value: "not_applicable" },
      "product_safety_review" => { state: "answered", value: "needs_clarification" },
      "nutrition_pattern" => { state: "answered", value: "variable_meals" },
      "beverage_pattern" => { state: "answered", value: "mixed" },
      "eating_concern" => { state: "answered", value: "unknown" },
      "nutrition_support" => { state: "answered", value: "interested" },
      "mental_health_support" => { state: "declined", value: "" },
      "substance_use_context" => { state: "answered", value: "none_reported" },
      "instrument_status" => { state: "answered", value: "not_selected" },
      "activity_capacity" => { state: "answered", value: "independent" },
      "activity_pattern" => { state: "answered", value: "occasional" },
      "sleep_quality" => { state: "answered", value: "unknown" },
      "transportation_access" => { state: "answered", value: "reliable" },
      "food_access" => { state: "answered", value: "adequate" },
      "caregiving_support" => { state: "answered", value: "unknown" },
      "social_support" => { state: "answered", value: "available" },
      "barrier_support_route" => { state: "answered", value: "none_reported" },
      "outside_records_state" => { state: "answered", value: "not_requested" },
      "lab_context_state" => { state: "answered", value: "not_reviewed" },
      "treatment_consent_state" => { state: "answered", value: "not_asked" },
      "telehealth_consent_state" => { state: "answered", value: "not_applicable" },
      "privacy_location_state" => { state: "answered", value: "private" },
      "coverage_context" => { state: "answered", value: "unknown" },
      "prior_authorization_state" => { state: "answered", value: "not_started" },
      "disclosure_state" => { state: "answered", value: "not_reviewed" },
      "patient_confirmation_state" => { state: "answered", value: "needs_correction" },
      "unresolved_item_state" => { state: "answered", value: "present" },
      "review_owner" => { state: "answered", value: "clinician" },
      "follow_up_context" => { state: "answered", value: "follow_up" },
      "change_since_last_visit" => { state: "answered", value: "medication_change" },
      "treatment_response" => { state: "answered", value: "mixed" },
      "treatment_tolerability" => { state: "answered", value: "side_effects_reported" },
      "access_status" => { state: "answered", value: "delayed" },
      "support_status" => { state: "answered", value: "needs_support" },
      "follow_up_plan_state" => { state: "answered", value: "clinician_review_needed" },
      "next_contact_window" => { state: "answered", value: "within_1_month" }
    )

    last = nil
    (0..10).each do |chunk|
      post intake_path, params: { intake: {
        request_key: "nurse-m7-m12-chunk-#{chunk}", expected_version: chunk,
        status: "incomplete", identity_state: "not_confirmed", visit_reason_state: "not_recorded",
        history_state: "not_recorded", vitals_state: "not_recorded", observation_ids: [], history_review_ids: [],
        questionnaire: { text: "", answers:, status: "submitted", confirmed: true, confirmed_chunks: (0..chunk).to_a }
      } }, headers: csrf_headers, as: :json
      assert_response :created
      last = response.parsed_body.fetch("intake")
    end

    assert_equal 11, last.fetch("version")
    assert_equal (0..10).to_a, last.dig("questionnaire", "confirmed_chunks")
    assert_equal "needs_clarification", last.dig("questionnaire", "answers", "product_safety_review", "value")
    assert_equal "mixed", last.dig("questionnaire", "answers", "treatment_response", "value")
    assert_equal "clinician_review_needed", last.dig("questionnaire", "answers", "follow_up_plan_state", "value")
    assert_includes last.fetch("questionnaire_text"), "glp1"
    assert_includes last.fetch("questionnaire_text"), "needs_clarification"
    assert_includes last.fetch("questionnaire_text"), "medication_change"
  end

  test "non-video handoff requires a recorded room" do
    @encounter.update!(room: nil)
    post intake_path, params: ready_intake(request_key: "nurse-roomless-intake", history_review_ids: @reviews.map(&:id)),
      headers: csrf_headers, as: :json
    assert_response :created
    intake = response.parsed_body.fetch("intake")

    assert_no_difference "Clinic::EncounterHandoff.count" do
      post handoffs_path, params: { handoff: {
        intake_revision_id: intake.fetch("id"), request_key: "nurse-roomless-handoff"
      } }, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
      assert_includes response.parsed_body.fetch("error"), "Record the room"
    end
  end

  test "room assignment route records and replays the encounter room" do
    @encounter.update!(room: nil)
    request = { room: { room_id: @room.id, request_key: "nurse-room-route" } }

    assert_difference "Clinic::OperationReceipt.count", 1 do
      patch room_path, params: request, headers: csrf_headers, as: :json
      assert_response :success
    end
    assert_equal @room.id, response.parsed_body.dig("encounter", "room_id")

    assert_no_difference "Clinic::OperationReceipt.count" do
      patch room_path, params: request, headers: csrf_headers, as: :json
      assert_response :success
    end
    assert_equal @room.id, @encounter.reload.room_id
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

  test "intake correction invalidates an older review task and evidence stays scoped" do
    intake = Clinic::Care::PrevisitIntake
    review = Clinic::Care::IntakeReview
    encode = ->(state) { intake.encode(text: "", answers: { pregnancy_status: { state: } },
      attested: false, status: "draft", recorder: "staff") }
    args = { practice: @practice, patient: @patient, encounter: @encounter,
      member: @membership, chunks: Clinic::Care::NurseWorkflow.chunks_for(form_id: intake::FORM_ID) }
    first = review.attach!(**args, encoded: encode.call("unknown"), previous: nil)
    payload = intake.decode(first)
    task = Clinic::ClinicalTask.find(payload.fetch("review_items").first.fetch("task_id"))
    version = task.lock_version
    prior = Struct.new(:encrypted_questionnaire, :version_number, :id).new(first, 1, 123)
    corrected = review.attach!(**args, encoded: encode.call("declined"), previous: prior)
    assert_equal task.id, intake.decode(corrected).fetch("review_items").first.fetch("task_id")
    assert_operator task.reload.lock_version, :>, version
    assert task.events.exists?(action: "intake_response_changed")
    assert_raises(ArgumentError) do
      Clinic::Care::IntakeEvidence.normalize(["document:999999999"],
        practice: @practice, actor: @user, patient: @patient, encounter: @encounter)
    end
  end

  test "specialty mental health and procedure review routing preserves existing task ownership" do
    intake = Clinic::Care::PrevisitIntake
    review = Clinic::Care::IntakeReview
    form_id = "weight-management-initial-v1"
    encoded = intake.encode(text: "", attested: false, status: "draft", recorder: "staff", form_id:, answers: {
      mental_health_support: { state: "unknown" },
      procedures: { state: "answered", entries: [{ name: "Synthetic procedure" }] },
      nutrition_support: { state: "unknown" }
    })
    args = { practice: @practice, patient: @patient, encounter: @encounter,
      member: @membership, chunks: Clinic::Care::NurseWorkflow.chunks_for(form_id:) }
    attached = review.attach!(**args, encoded:, previous: nil)
    items = intake.decode(attached).fetch("review_items").index_by { |item| item.fetch("question_id") }

    %w[mental_health_support procedures].each do |question_id|
      assert_equal "support", intake.fields(form_id).find { |field| field[:id] == question_id }.fetch(:review_category)
      item = items.fetch(question_id)
      assert_equal "clinical", item.fetch("category")
      assert_equal "clinical", Clinic::ClinicalTask.find(item.fetch("task_id")).pool_code
    end
    support = items.fetch("nutrition_support")
    assert_equal "support", support.fetch("category")
    assert_equal "front_desk", Clinic::ClinicalTask.find(support.fetch("task_id")).pool_code

    existing = Clinic::ClinicalTask.find(items.fetch("mental_health_support").fetch("task_id"))
    existing.update!(pool_code: "front_desk", state: "claimed", assigned_to_membership: @membership)
    prior = Struct.new(:encrypted_questionnaire, :version_number, :id).new(attached, 1, 123)
    replay = nil
    assert_no_difference "Clinic::ClinicalTask.count" do
      replay = review.attach!(**args, encoded:, previous: prior)
    end
    replay_item = intake.decode(replay).fetch("review_items").find { |item| item["question_id"] == "mental_health_support" }
    assert_equal existing.id, replay_item.fetch("task_id")
    assert_equal "front_desk", existing.reload.pool_code
    assert_equal "claimed", existing.state
    assert_equal @membership.id, existing.assigned_to_membership_id
  end

  test "patient coordination is durable replay safe and rejects stale updates" do
    grant_permissions!(@membership, "patients.write")
    service = Clinic::Care::PatientCareCoordination
    payload = Clinic::Care::PatientCareCoordinationRevision.empty_payload
    payload["primary_care"] = { "state" => "known", "entries" => [
      { "name" => "Synthetic provider", "source" => "patient", "address_confirmed" => false }
    ] }
    args = { practice: @practice, actor: @user, patient: @patient, payload:,
      expected_revision: 0, request_key: "coordination-create" }
    first = service.save!(**args)
    assert_equal first.id, service.save!(**args).id
    assert_equal "Synthetic provider", first.reload.payload.dig("primary_care", "entries", 0, "name")
    assert_raises(ActiveRecord::StaleObjectError) do
      service.save!(**args.merge(request_key: "coordination-stale"))
    end
    assert_empty service.references(practice: @practice, actor: @user, patient: @other_patient,
      kind: "provider", query: "")[:references]
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

  def room_path
    "/api/clinic/patients/#{@patient.id}/encounters/#{@encounter.id}/room"
  end

  def tasks_path
    "/api/clinic/patients/#{@patient.id}/encounters/#{@encounter.id}/clinical_tasks"
  end

  def ready_intake(request_key:, history_review_ids:, expected_version: 0)
    { intake: { request_key:, expected_version:, status: "ready_for_handoff", identity_state: "confirmed",
      visit_reason_state: "confirmed", history_state: "reviewed", vitals_state: "not_applicable",
      observation_ids: [], history_review_ids: } }
  end

  def intake_revision_for(encounter, request_key, reason, recorded_at)
    payload = Clinic::Care::PrevisitIntake.encode(text: "", answers: {
      "visit_reason" => { "state" => "answered", "value" => reason }
    }, attested: false, status: "draft", recorder: "staff")
    Clinic::EncounterIntakeRevision.create!(practice: @practice, patient: encounter.patient, encounter:,
      version_number: 1, status: "incomplete", identity_state: "not_confirmed",
      visit_reason_state: "not_recorded", history_state: "not_recorded", vitals_state: "not_recorded",
      encrypted_questionnaire: payload, recorded_by_membership: @membership, recorded_at:, request_key:,
      content_digest: Digest::SHA256.hexdigest(request_key))
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
