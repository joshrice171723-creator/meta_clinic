require "test_helper"

class ClinicalPlanWorkflowTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Clinical Plan Organization")
    @practice = Clinic::Practice.create!(name: "Clinical Plan Practice", organization:, timezone: "UTC")
    @site = @practice.sites.create!(code: "PLAN")
    @user = User.create!(email_address: "clinical-plan@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "clinical_records.read", "medication_requests.write",
      "service_requests.write", "diagnoses.write", "procedures.write", "care_plans.write", "encounters.write")
    @patient = @practice.patients.create!(display_name: "Clinical Plan Patient", reference: "PLAN-001")
    @other_patient = @practice.patients.create!(display_name: "Other Plan Patient", reference: "PLAN-002")
    @encounter = @practice.encounters.create!(patient: @patient, site: @site,
      started_at: Time.utc(2026, 9, 10, 14), status: "open")
    login(@user)
  end

  test "five clinical record families retain revisions and connect orders to staff work" do
    get "#{workspace_path(@patient)}/clinical_plan_workspace", headers: @headers
    assert_response :success
    assert_equal "clinical-plan-workspace-v1", response.parsed_body.fetch("schema_version")
    assert_equal false, response.parsed_body.fetch("truncated").values.any?

    medication = create_record("medication_requests", "medication_request", {
      medication_name: "Clinical Plan Medication", intent: "order", transmission_state: "accepted",
      dose_text: "10 mg", route_text: "oral", frequency_text: "daily"
    }, "plan-medication-create")
    assert_equal [ "draft", "not_requested", 1 ],
      medication.values_at("status", "transmission_state", "version_number")
    raw_medication = ApplicationRecord.connection.select_value(
      "SELECT medication_name FROM clinic_medication_request_revisions WHERE id = #{medication.fetch('id')}"
    )
    refute_equal "Clinical Plan Medication", raw_medication

    medication_request = revision_body("medication_request", medication, "authorized", "plan-medication-authorize")
    medication = revise_record("medication_requests", "medication_request", medication, medication_request)
    assert_equal [ "authorized", 2 ], medication.values_at("status", "version_number")
    medication_task = Clinic::ClinicalTask.find_by!(source_type: "order", source_kind: "medication_request")
    assert_equal "open", medication_task.state
    assert_no_difference [ "Clinic::Care::MedicationRequestRevision.count", "Clinic::ClinicalTask.count" ] do
      patch "#{workspace_path(@patient)}/medication_requests/#{medication.fetch('series_id')}",
        params: medication_request, headers: csrf_headers, as: :json
      assert_response :created
    end
    stale = revision_body("medication_request", medication.merge("version_number" => 1), "completed", "plan-medication-stale")
    patch "#{workspace_path(@patient)}/medication_requests/#{medication.fetch('series_id')}",
      params: stale, headers: csrf_headers, as: :json
    assert_response :conflict

    service = create_record("service_requests", "service_request", {
      request_kind: "procedure", intent: "order", priority: "routine",
      requested_display: "Clinical plan procedure", destination: "Clinic procedure room",
      due_at: "2026-09-11T14:00:00Z"
    }, "plan-service-create")
    service = revise_record("service_requests", "service_request", service,
      revision_body("service_request", service, "active", "plan-service-activate"))
    service_task = Clinic::ClinicalTask.find_by!(source_type: "order", source_kind: "service_request")
    assert_equal service.fetch("prior_revision_id"), service_task.source_id
    service_work_item = Clinic::Operations::FollowUpWorklist.call(practice: @practice, actor: @user)
      .fetch(:clinical_tasks).find { |task| task.fetch(:id) == service_task.id }
    assert_equal "/clinic/patients/#{@patient.id}/encounters/#{@encounter.id}?focus=clinical-plan-workspace",
      service_work_item.fetch(:encounter_href)

    diagnosis = create_record("diagnoses", "diagnosis", {
      classification: "primary", diagnosis_display: "Clinical plan finding", code_system: "example",
      diagnosis_code: "PLAN-1"
    }, "plan-diagnosis-create")
    diagnosis = revise_record("diagnoses", "diagnosis", diagnosis,
      revision_body("diagnosis", diagnosis, "confirmed", "plan-diagnosis-confirm"))
    assert_equal "confirmed", diagnosis.fetch("status")

    procedure = create_record("procedures", "procedure", {
      procedure_display: "Clinical plan procedure", complication_state: "not_assessed",
      service_request_revision_id: service.fetch("id")
    }, "plan-procedure-create")
    procedure = revise_record("procedures", "procedure", procedure, {
      procedure: { status: "completed", performed_at: "2026-09-10T15:00:00Z",
        complication_state: "none_reported", expected_version: procedure.fetch("version_number"),
        request_key: "plan-procedure-complete" }
    })
    assert_equal [ "completed", "none_reported" ], procedure.values_at("status", "complication_state")

    plan = create_record("care_plans", "care_plan", {
      title: "Clinical plan follow-up", description: "Review progress after the visit", starts_on: "2026-09-10",
      ends_on: "2026-10-10"
    }, "plan-care-plan-create")
    goal = create_record("care_goals", "care_goal", {
      care_plan_revision_id: plan.fetch("id"), description: "Complete the agreed follow-up",
      target_on: "2026-10-01"
    }, "plan-care-goal-create")
    goal = revise_record("care_goals", "care_goal", goal,
      revision_body("care_goal", goal, "active", "plan-care-goal-activate"))
    assert_equal [ "active", plan.fetch("id") ], goal.values_at("status", "care_plan_revision_id")

    service = revise_record("service_requests", "service_request", service,
      revision_body("service_request", service, "completed", "plan-service-complete"))
    assert_equal "completed", Clinic::ClinicalTask.find_by!(source_type: "order", source_kind: "service_request").state

    get "#{workspace_path(@other_patient)}/clinical_plan_workspace", headers: @headers
    assert_response :not_found
    revision = Clinic::Care::EncounterDiagnosisRevision.find(diagnosis.fetch("id"))
    assert_raises ActiveRecord::StatementInvalid do
      revision.update_column(:status, "draft")
    end
  end

  test "clinical plan workspace denies a membership without its site scoped read permission" do
    denied = User.create!(email_address: "clinical-plan-denied@example.invalid", password: @password)
    denied_membership = @practice.memberships.create!(user: denied)
    grant_permissions!(denied_membership, "patients.read")
    login(denied)

    get "#{workspace_path(@patient)}/clinical_plan_workspace", headers: @headers
    assert_response :forbidden
  end

  private

  def workspace_path(patient)
    "/api/clinic/patients/#{patient.id}/encounters/#{@encounter.id}"
  end

  def create_record(collection, root, attributes, request_key)
    post "#{workspace_path(@patient)}/#{collection}",
      params: { root => attributes.merge(request_key:) }, headers: csrf_headers, as: :json
    assert_response :created
    response.parsed_body.fetch(root)
  end

  def revise_record(collection, root, record, body)
    patch "#{workspace_path(@patient)}/#{collection}/#{record.fetch('series_id')}",
      params: body, headers: csrf_headers, as: :json
    assert_response :created
    response.parsed_body.fetch(root)
  end

  def revision_body(root, record, status, request_key)
    { root => { status:, expected_version: record.fetch("version_number"), request_key: } }
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
