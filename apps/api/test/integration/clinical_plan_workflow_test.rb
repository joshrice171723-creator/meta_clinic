require "test_helper"

class ClinicalPlanWorkflowTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Clinical Plan Organization")
    @practice = Clinic::Practice.create!(name: "Clinical Plan Practice", organization:, timezone: "UTC")
    @site = @practice.sites.create!(code: "PLAN", status: "active")
    @user = User.create!(email_address: "clinical-plan@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "clinical_records.read", "medication_requests.write",
      "service_requests.write", "diagnoses.write", "procedures.write", "care_plans.write", "immunizations.write",
      "medication_administrations.write", "inventory.receive", "encounters.write", "intake.write", "facilities.write")
    @patient = @practice.patients.create!(display_name: "Clinical Plan Patient", reference: "PLAN-001")
    @other_patient = @practice.patients.create!(display_name: "Other Plan Patient", reference: "PLAN-002")
    @encounter = @practice.encounters.create!(patient: @patient, site: @site,
      started_at: Time.utc(2026, 9, 10, 14), status: "open")
    login(@user)
  end

  test "clinical record families retain revisions and connect orders to staff work" do
    get "#{workspace_path(@patient)}/clinical_plan_workspace", headers: @headers
    assert_response :success
    assert_equal "clinical-plan-workspace-v2", response.parsed_body.fetch("schema_version")
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
    assert_equal "/clinic/patients/#{@patient.id}/encounters/#{@encounter.id}?focus=clinical-plan-workspace" \
      "&order_kind=service_request&order_series_id=#{service.fetch('series_id')}&task_id=#{service_task.id}",
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

    immunization = create_record("immunizations", "immunization", {
      vaccine_name: "Clinical plan vaccine", occurrence_source: "patient_reported", cvx_code: "999"
    }, "plan-immunization-create")
    immunization = revise_record("immunizations", "immunization", immunization, {
      immunization: { status: "completed", administered_at: "2026-09-10T15:30:00Z",
        expected_version: immunization.fetch("version_number"), request_key: "plan-immunization-complete" }
    })
    assert_equal [ "completed", "999" ], immunization.values_at("status", "cvx_code")

    service = revise_record("service_requests", "service_request", service,
      { service_request: { status: "completed", completion_exception: "Completed before fulfillment tracking was enabled",
        expected_version: service.fetch("version_number"), request_key: "plan-service-complete" } })
    assert_equal "completed", Clinic::ClinicalTask.find_by!(source_type: "order", source_kind: "service_request").state

    get "#{workspace_path(@other_patient)}/clinical_plan_workspace", headers: @headers
    assert_response :not_found
    revision = Clinic::Care::EncounterDiagnosisRevision.find(diagnosis.fetch("id"))
    assert_raises ActiveRecord::StatementInvalid do
      revision.update_column(:status, "draft")
    end
  end

  test "completion evidence and configured assessments are required before final status" do
    service = create_record("service_requests", "service_request", {
      request_kind: "procedure", intent: "order", priority: "routine",
      requested_display: "Synthetic completion evidence check"
    }, "completion-evidence-service-create")
    service = revise_record("service_requests", "service_request", service,
      revision_body("service_request", service, "active", "completion-evidence-service-active"))

    patch "#{workspace_path(@patient)}/service_requests/#{service.fetch('series_id')}",
      params: revision_body("service_request", service, "completed", "completion-evidence-service-denied"),
      headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "fulfillment record"

    service = revise_record("service_requests", "service_request", service,
      { service_request: { status: "completed", completion_exception: "Synthetic legacy result reviewed",
        expected_version: service.fetch("version_number"), request_key: "completion-evidence-service-exception" } })
    assert_equal "Synthetic legacy result reviewed", service.fetch("completion_exception")

    immunization = create_record("immunizations", "immunization", {
      vaccine_name: "Synthetic clinic vaccine", occurrence_source: "administered_here"
    }, "immunization-evidence-create")
    patch "#{workspace_path(@patient)}/immunizations/#{immunization.fetch('series_id')}",
      params: { immunization: { status: "completed", administered_at: "2026-09-10T15:30:00Z",
        expected_version: immunization.fetch("version_number"), request_key: "immunization-evidence-denied" } },
      headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error").downcase, "unavailable"

    post "#{workspace_path(@patient)}/assessments",
      params: { assessment: { category: "depression", instrument_name: "Synthetic PHQ-style screen",
        request_key: "assessment-disabled" } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity

    Clinic::Configuration::PracticeFeatures.revise(
      practice: @practice, actor: @membership, request_key: "assessment-configure", expected_revision: 0,
      insurance_workflows_enabled: false, clinic_type: "primary_care", service_scope: [],
      assessment_scope: [ "depression" ]
    )
    assessment = create_record("assessments", "assessment", {
      category: "depression", instrument_name: "Synthetic PHQ-style screen", score_value: "4"
    }, "assessment-create")
    assert_equal "in_progress", assessment.fetch("status")

    patch "#{workspace_path(@patient)}/assessments/#{assessment.fetch('series_id')}",
      params: revision_body("assessment", assessment, "completed", "assessment-incomplete"),
      headers: csrf_headers, as: :json
    assert_response :unprocessable_entity

    patch "#{workspace_path(@patient)}/assessments/#{assessment.fetch('series_id')}",
      params: { assessment: { status: "completed", assessed_at: "2026-09-10T15:45:00Z",
        response_summary: "Synthetic responses reviewed with the patient", expected_version: assessment.fetch("version_number"),
        request_key: "assessment-source-required" } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "Response source"

    assessment = revise_record("assessments", "assessment", assessment,
      { assessment: { status: "completed", assessed_at: "2026-09-10T15:45:00Z",
        response_summary: "Synthetic responses reviewed with the patient", follow_up_plan: "Routine follow-up",
        response_source: "patient_reported", assessment_state: "assessed",
        expected_version: assessment.fetch("version_number"), request_key: "assessment-complete" } })
    assert_equal [ "completed", "depression", "patient_reported" ],
      assessment.values_at("status", "category", "response_source")

    patch "#{workspace_path(@patient)}/assessments/#{assessment.fetch('series_id')}",
      params: { assessment: { score_source: "calculated", expected_version: assessment.fetch("version_number"),
        request_key: "assessment-score-provenance-partial" } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "Score source and recorded time"

    assessment = revise_record("assessments", "assessment", assessment,
      { assessment: { score_source: "calculated", score_recorded_at: "2026-09-10T15:46:00Z",
        expected_version: assessment.fetch("version_number"), request_key: "assessment-score-provenance" } })
    assert_equal [ "4", "calculated", "2026-09-10T15:46:00Z" ],
      assessment.values_at("score_value", "score_source", "score_recorded_at")
  end

  test "administered-here immunizations retain exact staff facility lot and optional VIS evidence" do
    enable_immunization_administration!
    product = @practice.pharmacy_products.create!(
      name: "Synthetic vaccine dose", generic_name: "synthetic antigen", dosage_form: "injection",
      ndc: "00000-0999-01", sku: "PLAN-VAX-1", stock_unit: "mL", quantity_scale: 2,
      package_size: 1, unit_reference: "1 mL vial"
    )
    location = @practice.inventory_locations.create!(site: @site, name: "Synthetic vaccine refrigerator", kind: "storage")
    batch = Clinic::Inventory::Receiving.call(
      practice: @practice, actor: @user, supplier: "Synthetic vaccine supplier",
      reason: "Synthetic immunization fixture", request_key: SecureRandom.uuid,
      lines: [ { product_id: product.id, lot_number: "VAX-LOT-1", location_id: location.id,
        location: location.name, expires_on: "2027-01-31", amount: "5.00", input_unit: "mL" } ]
    ).lines.sole.batch
    draft_order = Clinic::Care::ClinicalPlanWorkflow.create(
      kind: :medication_requests, practice: @practice, actor: @user, patient: @patient, encounter: @encounter,
      attributes: { intent: "order", inventory_product_id: product.id, medication_name: product.name,
        dose_value: "0.5", dose_unit_code: "mL", route_code: "intramuscular" },
      request_key: SecureRandom.uuid
    )
    order = Clinic::Care::ClinicalPlanWorkflow.revise(
      kind: :medication_requests, series_id: draft_order.series_id, practice: @practice, actor: @user,
      patient: @patient, encounter: @encounter, attributes: { status: "authorized" },
      expected_version: draft_order.version_number, request_key: SecureRandom.uuid
    )
    administered_at = Time.utc(2026, 9, 10, 15, 30)
    administration = Clinic::Care::AdministerMedication.call(
      practice: @practice, actor: @user, encounter: @encounter,
      medication_request_revision_id: order.id, status: "completed",
      allocations: [ { batch_id: batch.id, quantity: "0.50" } ], dose_value: "0.5", dose_unit_code: "mL",
      route_code: "intramuscular", administration_site_code: "left_deltoid", administration_site_text: nil,
      status_reason: nil, variance_reason: nil, precheck_status: "completed", precheck_notes: nil,
      verification_status: "not_required", verified_by_membership_id: nil,
      response_text: "Synthetic administration tolerated", education_text: "Synthetic education recorded",
      administered_at:, request_key: SecureRandom.uuid
    ).medication_administration

    immunization = create_record("immunizations", "immunization", {
      vaccine_name: "Synthetic clinic vaccine", occurrence_source: "administered_here"
    }, "immunization-admin-create")
    immunization = revise_record("immunizations", "immunization", immunization, {
      immunization: { status: "completed", cvx_code: "999", manufacturer: "Synthetic Vaccine Company",
        manufacturer_mvx_code: "syn", medication_administration_id: administration.id,
        vis_edition_date: "2026-08-01", vis_given_date: "2026-09-10",
        expected_version: immunization.fetch("version_number"), request_key: "immunization-admin-complete" }
    })

    assert_equal [ "SYN", "VAX-LOT-1", "2027-01-31" ],
      immunization.values_at("manufacturer_mvx_code", "lot_number", "lot_expiration_date")
    assert_equal administered_at.iso8601, immunization.fetch("administered_at")
    assert_equal @membership.id, immunization.fetch("vaccinator_membership_id")
    assert_equal @site.id, immunization.fetch("administering_site_id")
    assert_equal @site.name, immunization.fetch("administering_site_label")
    assert_equal [ "2026-08-01", "2026-09-10" ],
      immunization.values_at("vis_edition_date", "vis_given_date")
  end

  test "fulfillment links and referral exchanges close the loop without replacing source records" do
    medication = create_record("medication_requests", "medication_request", {
      medication_name: "Closure medication", intent: "order"
    }, "closure-medication-create")
    statement = Clinic::Care::MedicationStatement.create!(
      practice: @practice, patient: @patient, data_status: "recorded", medication_name: "Closure medication",
      status: "active", information_source: "clinician", recorded_by_membership: @membership,
      recorded_at: Time.utc(2026, 9, 10, 14, 30)
    )
    link_body = { clinical_plan_link: {
      source_kind: "medication_request", source_revision_id: medication.fetch("id"),
      target_kind: "medication_statement", target_id: statement.id,
      outcome_summary: "Medication list reconciled", request_key: "closure-medication-link"
    } }
    assert_difference "Clinic::Care::ClinicalPlanLink.count", 1 do
      post "#{workspace_path(@patient)}/clinical_plan_workspace/fulfillment_links",
        params: link_body, headers: csrf_headers, as: :json
      assert_response :created
    end
    assert_no_difference "Clinic::Care::ClinicalPlanLink.count" do
      post "#{workspace_path(@patient)}/clinical_plan_workspace/fulfillment_links",
        params: link_body, headers: csrf_headers, as: :json
      assert_response :created
    end

    referral = create_record("service_requests", "service_request", {
      request_kind: "referral", intent: "order", priority: "urgent",
      requested_display: "Synthetic specialist review", destination: "Synthetic specialty clinic"
    }, "closure-referral-create")
    post "#{workspace_path(@patient)}/clinical_plan_workspace/fulfillment_links",
      params: { clinical_plan_link: { source_kind: "service_request", source_revision_id: referral.fetch("id"),
        target_kind: "lab_report", target_id: 1, request_key: "closure-referral-wrong-target" } },
      headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    event_body = lambda do |stage, key|
      { referral_event: { service_request_revision_id: referral.fetch("id"), direction: "outbound", stage:,
        organization_name: "Synthetic specialty clinic", note: "Synthetic exchange evidence", request_key: key } }
    end
    %w[prepared sent received acknowledged closed].each do |stage|
      post "#{workspace_path(@patient)}/clinical_plan_workspace/referral_events",
        params: event_body.call(stage, "closure-referral-#{stage}"), headers: csrf_headers, as: :json
      assert_response :created
    end
    assert_equal %w[prepared sent received acknowledged closed],
      Clinic::Care::ReferralExchangeEvent.order(:id).pluck(:stage)

    post "#{workspace_path(@patient)}/clinical_plan_workspace/referral_events",
      params: event_body.call("sent", "closure-referral-invalid"), headers: csrf_headers, as: :json
    assert_response :unprocessable_entity

    get "#{workspace_path(@patient)}/clinical_plan_workspace", headers: @headers
    assert_response :success
    assert_equal 1, response.parsed_body.fetch("links").length
    assert_equal "closed", response.parsed_body.fetch("referral_events").first.fetch("stage")
    assert response.parsed_body.fetch("available_link_targets").fetch("medication_statement")
      .any? { |target| target.fetch("id") == statement.id }
  end

  test "clinical plan workspace denies a membership without its site scoped read permission" do
    denied = User.create!(email_address: "clinical-plan-denied@example.invalid", password: @password)
    denied_membership = @practice.memberships.create!(user: denied)
    grant_permissions!(denied_membership, "patients.read")
    login(denied)

    get "#{workspace_path(@patient)}/clinical_plan_workspace", headers: @headers
    assert_response :forbidden
  end

  test "six synthetic staff roles see only the clinical plan actions they own" do
    nurse = staff_user("nurse", %w[patients.read clinical_records.read medication_requests.write
      service_requests.write procedures.write care_plans.write immunizations.write])
    login(nurse)
    get "#{workspace_path(@patient)}/clinical_plan_workspace", headers: @headers
    assert_response :success
    assert_equal true, response.parsed_body.fetch("capabilities").fetch("immunizations")
    create_record("immunizations", "immunization", {
      vaccine_name: "Synthetic nurse vaccine", occurrence_source: "administered_here"
    }, "role-nurse-immunization")

    clinician = staff_user("clinician", %w[patients.read clinical_records.read diagnoses.write
      medication_requests.write service_requests.write procedures.write care_plans.write immunizations.write])
    login(clinician)
    create_record("diagnoses", "diagnosis", {
      classification: "differential", diagnosis_display: "Synthetic clinician finding"
    }, "role-clinician-diagnosis")

    administrator = staff_user("administrator", %w[patients.read clinical_records.read service_requests.write])
    login(administrator)
    create_record("service_requests", "service_request", {
      request_kind: "referral", intent: "order", priority: "routine",
      requested_display: "Synthetic administrator referral"
    }, "role-administrator-referral")

    viewer = staff_user("viewer", %w[patients.read clinical_records.read])
    login(viewer)
    get "#{workspace_path(@patient)}/clinical_plan_workspace", headers: @headers
    assert_response :success
    assert_equal false, response.parsed_body.fetch("capabilities").fetch("immunizations")
    post "#{workspace_path(@patient)}/immunizations",
      params: { immunization: { vaccine_name: "Denied", occurrence_source: "patient_reported",
        request_key: "role-viewer-denied" } }, headers: csrf_headers, as: :json
    assert_response :forbidden

    front_desk = staff_user("front-desk", %w[patients.read patients.identity.read appointments.read])
    login(front_desk)
    get "#{workspace_path(@patient)}/clinical_plan_workspace", headers: @headers
    assert_response :forbidden

    other_site = @practice.sites.create!(code: "OTHER-PLAN")
    site_limited_nurse = staff_user("other-site-nurse", %w[patients.read clinical_records.read immunizations.write],
      scope_kind: "site", site: other_site)
    login(site_limited_nurse)
    get "#{workspace_path(@patient)}/clinical_plan_workspace", headers: @headers
    assert_response :not_found
  end

  test "journey held orders retain their task identity and unrelated preparation remains available" do
    medication = create_record("medication_requests", "medication_request", {
      medication_name: "Synthetic held request", intent: "order", dose_text: "Source instruction"
    }, "journey-hold-create")
    medication = revise_record("medication_requests", "medication_request", medication,
      revision_body("medication_request", medication, "authorized", "journey-hold-authorize"))
    task = Clinic::ClinicalTask.find_by!(practice: @practice, source_kind: "medication_request")
    medication = revise_record("medication_requests", "medication_request", medication,
      revision_body("medication_request", medication, "on_hold", "journey-hold-order"))
    assert_equal "on_hold", task.reload.state
    assert_nil task.completed_at
    independent = create_record("service_requests", "service_request", {
      request_kind: "lab", intent: "order", priority: "routine", requested_display: "Synthetic independent test"
    }, "journey-held-rx-independent-lab")
    assert_equal "draft", independent.fetch("status")
    assert_equal @patient.id, independent.fetch("patient_id")
    assert_no_difference "Clinic::ClinicalTask.count" do
      revise_record("medication_requests", "medication_request", medication,
        revision_body("medication_request", medication, "authorized", "journey-resume-order"))
    end
    assert_equal "open", task.reload.state
  end

  test "journey pharmacy acceptance cannot be supplied through ordinary revision attributes" do
    medication = create_record("medication_requests", "medication_request", {
      medication_name: "Synthetic external request", intent: "order"
    }, "journey-transmission-create")
    assert_no_difference "Clinic::Care::MedicationRequestRevision.count" do
      patch "#{workspace_path(@patient)}/medication_requests/#{medication.fetch('series_id')}",
        params: { medication_request: { transmission_state: "accepted", expected_version: medication.fetch("version_number"),
          request_key: "journey-transmission-forged" } }, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
    end
    assert_equal "not_requested", Clinic::Care::MedicationRequestRevision.find(medication.fetch("id")).transmission_state
  end

  test "return workspace projects latest prior plans and goals without copying or crossing sites" do
    plan = create_record("care_plans", "care_plan", { title: "Prior care plan", description: "Original intent" }, "prior-plan")
    plan = revise_record("care_plans", "care_plan", plan,
      revision_body("care_plan", plan, "active", "prior-plan-active"))
    goal = create_record("care_goals", "care_goal", { care_plan_revision_id: plan.fetch("id"), description: "Practice the agreed goal" }, "prior-goal")
    original = @encounter
    @encounter = @practice.encounters.create!(patient: @patient, site: @site, started_at: 1.day.from_now, status: "open")
    assert_no_difference ["Clinic::Care::CarePlanRevision.count", "Clinic::Care::CareGoalRevision.count"] do
      get "#{workspace_path(@patient)}/clinical_plan_workspace", headers: @headers
      assert_response :success
    end
    prior = response.parsed_body.fetch("prior_care")
    assert_equal 2, prior.length
    assert_equal [original.id], prior.map { |row| row.fetch("encounter_id") }.uniq
    assert_equal 2, prior.find { |row| row["kind"] == "care_plans" }.fetch("revision")
    assert_equal goal.fetch("id"), prior.find { |row| row["kind"] == "care_goals" }.fetch("id")
    assert_empty response.parsed_body.dig("records", "care_plans")

    other_site = @practice.sites.create!(code: "PRIVATE", status: "active")
    @encounter.update!(site: other_site)
    reader = staff_user("return-reader", %w[patients.read clinical_records.read], scope_kind: "site", site: other_site)
    grant_permissions!(@practice.memberships.find_by!(user: reader), "patients.read")
    login(reader)
    get "#{workspace_path(@patient)}/clinical_plan_workspace", headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("prior_care")
  end

  test "care goal outcome provenance is revision-bound and complete when recorded" do
    plan = create_record("care_plans", "care_plan", {
      title: "Synthetic outcome plan", description: "Track a patient-selected goal"
    }, "goal-outcome-plan")
    goal = create_record("care_goals", "care_goal", {
      care_plan_revision_id: plan.fetch("id"), description: "Practice the agreed coping skill",
      outcome_text: "Patient reports partial progress.", outcome_source: "patient_reported",
      outcome_recorded_at: "2026-09-10T16:15:00Z"
    }, "goal-outcome-create")
    assert_equal [ "Patient reports partial progress.", "patient_reported", "2026-09-10T16:15:00Z" ],
      goal.values_at("outcome_text", "outcome_source", "outcome_recorded_at")

    revised = revise_record("care_goals", "care_goal", goal,
      revision_body("care_goal", goal, "active", "goal-outcome-activate"))
    assert_equal [ "patient_reported", "2026-09-10T16:15:00Z" ],
      revised.values_at("outcome_source", "outcome_recorded_at")

    post "#{workspace_path(@patient)}/care_goals", params: { care_goal: {
      care_plan_revision_id: plan.fetch("id"), description: "Incomplete provenance", outcome_source: "patient_reported",
      request_key: "goal-outcome-incomplete"
    } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "Outcome source and recorded time"
  end

  test "psychiatry assessment preserves item states and synthetic safety work after closure" do
    Clinic::Configuration::PracticeFeatures.revise(
      practice: @practice, actor: @membership, request_key: "psychiatry-profile", expected_revision: 0,
      insurance_workflows_enabled: false, clinic_type: "behavioral_health",
      service_scope: %w[psychiatric_evaluation medication_management urgent_clinical_follow_up],
      assessment_scope: [ "psychiatry_assessment" ]
    )
    assert_equal 8, @practice.visit_types.active.count

    assessment = create_record("assessments", "assessment", {
      category: "psychiatry_assessment", instrument_name: "Synthetic attention check", instrument_version: "test-v1",
      assessment_state: "unknown", response_source: "unknown", reviewer_membership_id: @membership.id,
      item_responses: [ { item_id: "attention", state: "unknown" } ]
    }, "psychiatry-assessment-unknown")
    assert_equal [ "unknown", [ { "item_id" => "attention", "state" => "unknown" } ], @membership.id ],
      assessment.values_at("assessment_state", "item_responses", "reviewer_membership_id")

    patch "#{workspace_path(@patient)}/assessments/#{assessment.fetch('series_id')}", params: {
      assessment: { status: "completed", expected_version: assessment.fetch("version_number"),
        request_key: "psychiatry-assessment-unknown-complete" }
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "must be assessed before completion"

    assessment = revise_record("assessments", "assessment", assessment, {
      assessment: { status: "completed", assessment_state: "assessed", response_source: "patient_reported",
        response_summary: "Synthetic response retained for review.", assessed_at: "2026-09-10T16:30:00Z",
        item_responses: [ { item_id: "attention", state: "answered", value: "sometimes" } ],
        expected_version: assessment.fetch("version_number"), request_key: "psychiatry-assessment-complete" }
    })
    assert_equal "assessed", assessment.fetch("assessment_state")
    assert_equal "sometimes", assessment.fetch("item_responses").first.fetch("value")

    post "#{workspace_path(@patient)}/clinical_tasks", params: { task: {
      request_key: "psychiatry-safety-follow-up", task_kind: "safety_follow_up", pool_code: "clinical"
    } }, headers: csrf_headers, as: :json
    assert_response :created
    safety_task = Clinic::ClinicalTask.find(response.parsed_body.dig("task", "id"))
    assert_equal [ "safety_follow_up", "open" ], safety_task.values_at(:task_kind, :state)

    Clinic::Scheduling::CloseEncounter.call(encounter: @encounter, actor: @user, request_key: "psychiatry-close")
    assert safety_task.reload.state.in?(Clinic::ClinicalTask::ACTIVE_STATES)
  end

  test "substitution remains unresolved in drafts and explicit choices retain revision history" do
    draft = create_record("medication_requests", "medication_request", {
      medication_name: "Synthetic substitution draft", substitution_instruction: ""
    }, "substitution-draft")
    assert_nil draft.fetch("substitution_instruction")
    original = Clinic::Care::MedicationRequestRevision.find(draft.fetch("id"))
    %w[allowed not_allowed].each_with_index do |choice, index|
      draft = revise_record("medication_requests", "medication_request", draft, {
        medication_request: { substitution_instruction: choice, expected_version: draft.fetch("version_number"),
          request_key: "substitution-choice-#{index}" }
      })
      assert_equal choice, draft.fetch("substitution_instruction")
    end
    assert_nil original.reload.substitution_instruction
    assert_equal [nil, "allowed", "not_allowed"], Clinic::Care::MedicationRequestRevision
      .where(series_id: draft.fetch("series_id")).order(:version_number).pluck(:substitution_instruction)
    assert_no_difference "Clinic::Care::MedicationRequestRevision.count" do
      patch "#{workspace_path(@patient)}/medication_requests/#{draft.fetch('series_id')}",
        params: { medication_request: { substitution_instruction: "automatic", expected_version: draft.fetch("version_number"),
          request_key: "invalid-substitution-choice" } }, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
    end
  end

  test "substitution create boundary accepts explicit choices and rejects unsupported choices" do
    %w[allowed not_allowed].each do |choice|
      draft = create_record("medication_requests", "medication_request", {
        medication_name: "Synthetic explicit substitution draft", substitution_instruction: choice
      }, "substitution-create-#{choice}")
      assert_equal choice, draft.fetch("substitution_instruction")
    end
    assert_no_difference "Clinic::Care::MedicationRequestRevision.count" do
      post "#{workspace_path(@patient)}/medication_requests", params: { medication_request: {
        medication_name: "Synthetic invalid substitution draft", substitution_instruction: "automatic",
        request_key: "substitution-create-invalid"
      } }, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
    end
  end

  test "synthetic prescription journey has an explicit fixture choice before review" do
    Development::DemoSandboxJourneys.send(:medication_story!, practice: @practice, actor: @user,
      patient: @patient, encounter: @encounter, transmit: true)
    order = Clinic::Care::MedicationRequestRevision.where(practice: @practice, patient: @patient)
      .order(:id).last!
    assert_equal "not_allowed", order.substitution_instruction
    assert Clinic::Care::PrescriptionWorkflow.events(order).exists?(medication_request_revision_id: order.id, kind: "review")
    assert_equal "accepted", Clinic::Care::PrescriptionTransmissionWorkflow.attempts(order).last!.outcome
  end

  test "synthetic prescription outcome example has an explicit fixture choice before review" do
    @site.rooms.create!(practice: @practice, code: "SYNTHETIC-RX")
    destination = Clinic::Care::PharmacyDestination.create!(practice: @practice, name: "Synthetic outcome destination",
      address_line1: "100 Synthetic Way", city: "Austin", state_code: "TX", postal_code: "78701")
    run = Struct.new(:id).new("synthetic-substitution-test")
    Development::DemoSandboxPrescriptionOutcomes.send(:prepare_outcome!, run:, practice: @practice,
      site: @site, patient: @other_patient, actor: @user, destination:, outcome: "unknown")
    order = Clinic::Care::MedicationRequestRevision.where(practice: @practice, patient: @other_patient)
      .order(:id).last!
    assert_equal "not_allowed", order.substitution_instruction
    assert Clinic::Care::PrescriptionWorkflow.events(order).exists?(medication_request_revision_id: order.id, kind: "review")
    assert_equal "unknown", Clinic::Care::PrescriptionTransmissionWorkflow.attempts(order).last!.outcome
  end

  test "outside pharmacy release requires an explicit substitution choice and changing it invalidates exact review" do
    order = authorized_outside_pharmacy_order("substitution-release")
    Clinic::Care::PrescriptionWorkflow.record(practice: @practice, actor: @user, order: order,
      kind: "review", source: "manual", request_key: "substitution-original-review")
    serialized = Clinic::Care::ClinicalPlanWorkflow.serialize(:medication_requests, order).stringify_keys
    changed = revise_record("medication_requests", "medication_request", serialized, {
      medication_request: { substitution_instruction: "allowed", expected_version: order.version_number,
        request_key: "substitution-revised-choice" }
    })
    current = Clinic::Care::MedicationRequestRevision.find(changed.fetch("id"))
    assert_equal "not_allowed", order.reload.substitution_instruction
    assert_equal "allowed", current.substitution_instruction
    assert_not Clinic::Care::PrescriptionWorkflow.events(current)
      .exists?(medication_request_revision_id: current.id, kind: "review")
    unresolved = revise_record("medication_requests", "medication_request", changed, {
      medication_request: { substitution_instruction: "", expected_version: current.version_number,
        request_key: "substitution-unresolved" }
    })
    unresolved = Clinic::Care::MedicationRequestRevision.find(unresolved.fetch("id"))
    assert_nil unresolved.substitution_instruction
    error = assert_raises(ArgumentError) { Clinic::Care::PrescriptionWorkflow.validate_release!(unresolved) }
    assert_includes error.message, "Choose whether substitution is allowed"
    assert_no_difference "Clinic::Care::PrescriptionEvent.count" do
      assert_raises(ArgumentError) do
        Clinic::Care::PrescriptionWorkflow.record(practice: @practice, actor: @user, order: unresolved,
          kind: "review", source: "manual", request_key: "substitution-unresolved-review")
      end
    end
  end

  test "controlled prescription simulator snapshots synthetic signer state and fences recovery" do
    Clinic::Configuration::PracticeFeatures.revise(
      practice: @practice, actor: @membership, request_key: "controlled-profile", expected_revision: 0,
      insurance_workflows_enabled: false, clinic_type: "behavioral_health",
      service_scope: %w[controlled_medications medication_management], assessment_scope: []
    )
    destination = Clinic::Care::PharmacyDestination.create!(practice: @practice, name: "Synthetic Pharmacy",
      address_line1: "1 Demo Way", city: "Austin", state_code: "TX", postal_code: "78701")

    accepted = authorized_outside_pharmacy_order("controlled-accepted")
    Clinic::Care::PrescriptionWorkflow.record(practice: @practice, actor: @user, order: accepted, kind: "review",
      source: "manual", request_key: "controlled-accepted-review")
    attempt = Clinic::Care::PrescriptionTransmissionWorkflow.submit(practice: @practice, actor: @user, order: accepted,
      pharmacy_destination_id: destination.id, scenario: "accepted", mode: "controlled_test",
      signer_state: "active", reviewer_state: "active", request_key: "controlled-accepted-submit")
    assert_equal [ "controlled_test", "accepted", "active", "active" ],
      [ attempt.mode, attempt.outcome, attempt.signer_snapshot.fetch("state"), attempt.reviewer_snapshot.fetch("state") ]
    assert_raises(ArgumentError) do
      Clinic::Care::PrescriptionTransmissionWorkflow.submit(practice: @practice, actor: @user, order: accepted,
        pharmacy_destination_id: destination.id, scenario: "accepted", mode: "controlled_test",
        signer_state: "active", reviewer_state: "active", request_key: "controlled-accepted-new-submit")
    end

    %w[rejected unavailable duplicate].each do |scenario|
      order = authorized_outside_pharmacy_order("controlled-#{scenario}")
      Clinic::Care::PrescriptionWorkflow.record(practice: @practice, actor: @user, order:, kind: "review",
        source: "manual", request_key: "controlled-#{scenario}-review")
      simulated = Clinic::Care::PrescriptionTransmissionWorkflow.submit(practice: @practice, actor: @user, order:,
        pharmacy_destination_id: destination.id, scenario:, mode: "controlled_test",
        signer_state: "active", reviewer_state: "active", request_key: "controlled-#{scenario}-submit")
      assert_equal scenario, simulated.outcome
    end

    unknown = authorized_outside_pharmacy_order("controlled-unknown")
    Clinic::Care::PrescriptionWorkflow.record(practice: @practice, actor: @user, order: unknown, kind: "review",
      source: "manual", request_key: "controlled-unknown-review")
    first = Clinic::Care::PrescriptionTransmissionWorkflow.submit(practice: @practice, actor: @user, order: unknown,
      pharmacy_destination_id: destination.id, scenario: "outcome_unknown", mode: "controlled_test",
      signer_state: "active", reviewer_state: "active", request_key: "controlled-unknown-submit")
    duplicate = Clinic::Care::PrescriptionTransmissionWorkflow.submit(practice: @practice, actor: @user, order: unknown,
      pharmacy_destination_id: destination.id, scenario: "outcome_unknown", mode: "controlled_test",
      signer_state: "active", reviewer_state: "active", request_key: "controlled-unknown-submit")
    assert_equal first.id, duplicate.id
    assert_raises(ArgumentError) do
      Clinic::Care::PrescriptionTransmissionWorkflow.submit(practice: @practice, actor: @user, order: unknown,
        pharmacy_destination_id: destination.id, scenario: "accepted", mode: "controlled_test",
        signer_state: "active", reviewer_state: "active", request_key: "controlled-unknown-new-submit")
    end

    revoked = authorized_outside_pharmacy_order("controlled-revoked")
    Clinic::Care::PrescriptionWorkflow.record(practice: @practice, actor: @user, order: revoked, kind: "review",
      source: "manual", request_key: "controlled-revoked-review")
    attempt = Clinic::Care::PrescriptionTransmissionWorkflow.submit(practice: @practice, actor: @user, order: revoked,
      pharmacy_destination_id: destination.id, scenario: "revoked", mode: "controlled_test",
      signer_state: "revoked", reviewer_state: "active", request_key: "controlled-revoked-submit")
    assert_equal "revoked", attempt.signer_snapshot.fetch("state")
  end

  private

  def enable_immunization_administration!
    optional_features = {
      "clinic_type" => "primary_care",
      "service_scope" => [ "vaccinations" ],
      "assessment_scope" => [],
      "immunization_administration_enabled" => true
    }
    Clinic::PracticeFeatureVersion.create!(
      practice: @practice,
      created_by_membership: @membership,
      revision: 1,
      optional_features:,
      effective_from: Current.business_time,
      request_key: "authorized-immunization-administration",
      content_digest: Digest::SHA256.hexdigest(optional_features.to_json)
    )
  end

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

  def authorized_outside_pharmacy_order(key)
    order = create_record("medication_requests", "medication_request", {
      medication_name: "Synthetic controlled medication #{key}", intent: "order", medication_strength: "10 mg",
      medication_form: "tablet", medication_code_system: "test", medication_code: "#{key}-code",
      catalog_source: "synthetic", dose_text: "10 mg", route_text: "Oral", frequency_text: "daily",
      instructions: "Synthetic test instruction", prescribed_quantity: "30", quantity_unit: "tablet", refills: "0",
      fulfillment_route: "outside_pharmacy", pharmacy_name: "Synthetic Pharmacy", pharmacy_location: "Austin",
      substitution_instruction: "not_allowed"
    }, "#{key}-create")
    revise_record("medication_requests", "medication_request", order,
      revision_body("medication_request", order, "authorized", "#{key}-authorize")).then do |result|
        Clinic::Care::MedicationRequestRevision.find(result.fetch("id"))
      end
  end

  def revision_body(root, record, status, request_key)
    { root => { status:, expected_version: record.fetch("version_number"), request_key: } }
  end

  def staff_user(label, permissions, scope_kind: "practice", site: nil)
    user = User.create!(email_address: "clinical-plan-#{label}@example.invalid", password: @password)
    membership = @practice.memberships.create!(user:)
    grant_permissions!(membership, *permissions, scope_kind:, site:)
    user
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
