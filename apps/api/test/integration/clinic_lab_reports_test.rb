require "test_helper"

class ClinicLabReportsTest < ActionDispatch::IntegrationTest
  setup do
    organization = Organization.create!(name: "Lab report test organization")
    @practice = Clinic::Practice.create!(name: "Lab report practice", organization:, timezone: "UTC")
    @other_practice = Clinic::Practice.create!(name: "Other lab report practice", organization:, timezone: "UTC")
    @password = SecureRandom.hex(18)
    @actor = User.create!(email_address: "lab-reports@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "patients.read", "notes.read", "notes.write", "observations.write")
    @site = @practice.sites.create!(code: "LAB")
    @patient = @practice.patients.create!(display_name: "Lab Report Patient", reference: "LAB-001")
    @encounter = @practice.encounters.create!(
      patient: @patient, site: @site, started_at: Time.utc(2026, 9, 6, 12), status: "open"
    )
    @lab_order = create_lab_order(
      practice: @practice, patient: @patient, encounter: @encounter, membership: @membership,
      key: "default-lab-order"
    )
    @other_patient = @other_practice.patients.create!(display_name: "Other Lab Patient", reference: "LAB-OTHER")
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    post "/api/session", params: { email_address: @actor.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "manual report creation is idempotent encrypted and tenant scoped" do
    request = create_params(request_key: "lab-report-create-1")
    post reports_path, params: request, headers: csrf_headers, as: :json
    assert_response :created
    report_payload = response.parsed_body.fetch("report")
    report = @practice.lab_reports.find(report_payload.fetch("id"))
    version = report.current_version

    assert_equal "ACCN-1042", report_payload.fetch("external_report_id")
    assert_equal @lab_order.id, report_payload.fetch("service_request_revision_id")
    assert_equal "SPEC-1042", report_payload.dig("specimen", "specimen_identifier")
    assert_equal "venous-blood", report_payload.dig("specimen", "specimen_type_code")
    assert_equal @encounter.id, report.lab_specimen.encounter_id
    assert Clinic::Care::ClinicalPlanLink.exists?(
      service_request_revision: @lab_order, lab_report: report,
      source_kind: "service_request", target_kind: "lab_report"
    )
    assert_equal "4.70", version.results.sole.fetch("value")
    raw_external_id = ApplicationRecord.connection.select_value(
      "SELECT external_report_id FROM clinic_lab_reports WHERE id = #{report.id.to_i}"
    )
    raw_results = ApplicationRecord.connection.select_value(
      "SELECT results_payload FROM clinic_lab_report_versions WHERE id = #{version.id.to_i}"
    )
    assert_not_equal "ACCN-1042", raw_external_id
    assert_not_includes raw_results, "4.70"

    post reports_path, params: request, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal report.id, response.parsed_body.dig("report", "id")
    assert_equal 1, @practice.lab_reports.count
    assert_equal 1, report.report_versions.count

    get reports_path(patient: @other_patient), headers: @headers
    assert_response :not_found
    assert_empty @other_practice.lab_reports
  end

  test "new versions preserve history and only the current version can be reviewed once" do
    post reports_path, params: create_params(request_key: "lab-report-version-base"), headers: csrf_headers, as: :json
    assert_response :created
    report = @practice.lab_reports.find(response.parsed_body.dig("report", "id"))
    first = report.current_version

    append = version_params(
      request_key: "lab-report-version-2", expected_current_version_id: first.id,
      status: "corrected", value: "4.90"
    )
    post versions_path(report), params: append, headers: csrf_headers, as: :json
    assert_response :created
    second = report.reload.current_version
    assert_equal 2, second.version_number
    assert_equal "4.90", second.results.sole.fetch("value")
    assert_equal "4.70", first.reload.results.sole.fetch("value")

    post versions_path(report), params: append, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal second.id, response.parsed_body.dig("version", "id")
    assert_equal 2, report.report_versions.count

    stale = version_params(
      request_key: "lab-report-version-stale", expected_current_version_id: first.id,
      status: "amended", value: "5.00"
    )
    post versions_path(report), params: stale, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "stale_record", response.parsed_body.fetch("code")

    post review_path(report, first), params: review_params("lab-report-review-stale"), headers: csrf_headers, as: :json
    assert_response :conflict
    assert_nil first.reload.reviewed_at

    review = review_params("lab-report-review-current")
    post review_path(report, second), params: review, headers: csrf_headers, as: :json
    assert_response :success
    reviewed_at = response.parsed_body.dig("version", "reviewed_at")
    assert reviewed_at.present?
    assert_equal @membership.id, response.parsed_body.dig("version", "reviewed_by")

    post review_path(report, second), params: review, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal reviewed_at, response.parsed_body.dig("version", "reviewed_at")

    post review_path(report, second), params: review_params("lab-report-review-again"), headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "already reviewed"

    assert_equal "Complete blood count", first.reload.title
    assert_raises(ActiveRecord::StatementInvalid) do
      Clinic::Care::LabReportVersion.where(id: first.id).update_all(title: "Rewritten result")
    end
  end

  test "review queue returns only visible unreviewed current versions oldest first without result values" do
    oldest = create_report(
      patient: @patient,
      key: "queue-oldest",
      issued_at: Time.utc(2026, 9, 6, 10),
      title: "Oldest unreviewed report",
      results: [
        { name: "First", value: "queue-secret-one" },
        { name: "Second", value: "queue-secret-two" }
      ]
    )
    amended = create_report(
      patient: @patient,
      key: "queue-amended-base",
      issued_at: Time.utc(2026, 9, 6, 9),
      title: "Superseded report"
    )
    superseded_version = amended.current_version
    amended_version = Clinic::Care::LabReports.append_version(
      practice: @practice,
      actor: @actor,
      patient: @patient,
      report: amended,
      request_key: "queue-amended-version",
      confirmed_patient: true,
      expected_current_version_id: superseded_version.id,
      version: lab_version_attributes(
        issued_at: Time.utc(2026, 9, 6, 11),
        title: "Current amended report",
        status: "amended"
      )
    ).value
    reviewed = create_report(
      patient: @patient,
      key: "queue-reviewed",
      issued_at: Time.utc(2026, 9, 6, 8),
      title: "Reviewed report"
    )
    Clinic::Care::LabReports.review(
      practice: @practice,
      actor: @actor,
      patient: @patient,
      report: reviewed,
      version: reviewed.current_version,
      request_key: "queue-reviewed-decision",
      confirmed_patient: true
    )

    foreign_actor = User.create!(email_address: "foreign-lab-queue@example.invalid", password: SecureRandom.hex(18))
    foreign_membership = @other_practice.memberships.create!(user: foreign_actor)
    grant_permissions!(foreign_membership, "patients.read", "notes.read", "observations.write")
    create_report(
      practice: @other_practice,
      actor: foreign_actor,
      patient: @other_patient,
      key: "queue-foreign",
      issued_at: Time.utc(2026, 9, 6, 7),
      title: "Foreign report"
    )

    get review_queue_path, params: { page: 1, per_page: 1 }, headers: @headers
    assert_response :success
    first_page = response.parsed_body
    assert_equal({ "page" => 1, "per_page" => 1, "total" => 2 }, first_page.fetch("pagination"))
    assert_equal true, first_page.fetch("can_review")
    first_item = first_page.fetch("items").sole
    assert_equal oldest.id, first_item.fetch("report_id")
    assert_equal @patient.id, first_item.dig("patient", "id")
    assert_equal 2, first_item.dig("current_version", "result_count")
    assert_equal "final", first_item.dig("current_version", "status")
    assert_nil first_item.dig("current_version", "results")
    refute_includes JSON.generate(first_page), "queue-secret-one"

    get review_queue_path, params: { page: 2, per_page: 1 }, headers: @headers
    assert_response :success
    second_item = response.parsed_body.fetch("items").sole
    assert_equal amended.id, second_item.fetch("report_id")
    assert_equal amended_version.id, second_item.dig("current_version", "id")
    assert_not_equal superseded_version.id, second_item.dig("current_version", "id")

    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.read", "notes.read")
    get review_queue_path, headers: @headers
    assert_response :success
    assert_equal false, response.parsed_body.fetch("can_review")

    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.read")
    get review_queue_path, headers: @headers
    assert_response :forbidden

    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "notes.read")
    get review_queue_path, headers: @headers
    assert_response :forbidden

    assert_recognizes(
      { controller: "clinic/care/lab_reports", action: "review_queue" },
      { path: review_queue_path, method: :get }
    )
  end

  test "review records one required follow-up atomically and completion is idempotent" do
    post reports_path, params: create_params(request_key: "follow-up-review-create"), headers: csrf_headers, as: :json
    assert_response :created
    report = @practice.lab_reports.find(response.parsed_body.dig("report", "id"))
    version = report.current_version

    invalid_review = review_params("follow-up-review-invalid").deep_merge(
      review: { follow_up_disposition: "required", follow_up_note: "" }
    )
    post review_path(report, version), params: invalid_review, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_nil version.reload.reviewed_at
    assert_nil version.follow_up

    unsupported_due = review_params("follow-up-review-unsupported-due").deep_merge(review: {
      follow_up_disposition: "required", follow_up_note: "Review repeat results.",
      follow_up_due_at: "2026-09-20T17:15:00Z"
    })
    post review_path(report, version), params: unsupported_due, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_match(/only to urgent and critical/, response.parsed_body.fetch("error"))
    assert_nil version.reload.reviewed_at
    assert_nil version.follow_up

    review = review_params("follow-up-review-required").deep_merge(
      review: {
        follow_up_disposition: "required",
        follow_up_note: "Repeat the lab in two weeks and review the result."
      }
    )
    post review_path(report, version), params: review, headers: csrf_headers, as: :json
    assert_response :success
    first_payload = response.parsed_body.dig("version", "follow_up")
    assert_equal "open", first_payload.fetch("state")
    assert_equal "Repeat the lab in two weeks and review the result.", first_payload.fetch("instructions")
    assert_nil first_payload.fetch("due_at")
    assert_nil first_payload.fetch("outcome")
    assert_equal @membership.id, first_payload.fetch("recorded_by")
    assert_nil first_payload.fetch("completed_at")
    assert_nil first_payload.fetch("completed_by")
    assert_nil first_payload.fetch("superseded_at")
    assert_equal 1, Clinic::Care::LabResultFollowUp.where(lab_report_version: version).count

    post review_path(report, version), params: review, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal first_payload.fetch("id"), response.parsed_body.dig("version", "follow_up", "id")
    assert_equal 1, Clinic::Care::LabResultFollowUp.where(lab_report_version: version).count

    changed_review = review.deep_dup
    changed_review[:review][:follow_up_note] = "Use the request key for different instructions."
    post review_path(report, version), params: changed_review, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "idempotency_conflict", response.parsed_body.fetch("code")

    get follow_up_queue_path, headers: @headers
    assert_response :success
    queue = response.parsed_body
    assert_equal true, queue.fetch("can_complete")
    assert_equal 1, queue.dig("pagination", "total")
    item = queue.fetch("items").sole
    assert_equal report.id, item.fetch("report_id")
    assert_equal version.id, item.dig("version", "id")
    assert_equal version.version_number, item.dig("version", "version_number")
    assert_equal first_payload.fetch("id"), item.dig("follow_up", "id")
    refute item.fetch("version").key?("results")
    refute_includes JSON.generate(queue), "4.70"

    completion = {
      follow_up: { request_key: "follow-up-complete", outcome: "Repeat result reviewed; no further action is needed." }
    }
    post complete_follow_up_path(report, version), params: completion, headers: csrf_headers, as: :json
    assert_response :success
    completed = response.parsed_body.dig("version", "follow_up")
    assert_equal first_payload.fetch("id"), completed.fetch("id")
    assert_equal "completed", completed.fetch("state")
    assert_equal "Repeat result reviewed; no further action is needed.", completed.fetch("outcome")
    assert_equal @membership.id, completed.fetch("completed_by")
    assert completed.fetch("completed_at").present?

    post complete_follow_up_path(report, version), params: completion, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal completed, response.parsed_body.dig("version", "follow_up")

    get follow_up_queue_path, headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("items")
    assert @practice.audit_events.exists?(action_code: "lab_report.follow_up.record", outcome: "committed")
    assert @practice.audit_events.exists?(action_code: "lab_report.follow_up.complete", outcome: "committed")
    assert_raises(ActiveRecord::StatementInvalid) do
      Clinic::Care::LabResultFollowUp.where(id: completed.fetch("id")).update_all(outcome: "Rewritten outcome")
    end
  end

  test "lab follow-up completion preserves all contact tasks until their prerequisites finish" do
    grant_permissions!(@membership, "encounters.write")
    report = create_report(patient: @patient, key: "contact-prerequisite", issued_at: Time.utc(2026, 9, 6, 18),
      title: "Contact prerequisite report")
    version = report.current_version
    post review_path(report, version), params: review_params("contact-prerequisite-review").deep_merge(
      review: { follow_up_disposition: "required", follow_up_note: "Contact patient and review records." }
    ), headers: csrf_headers, as: :json
    assert_response :success
    follow_up = version.reload.follow_up
    tasks = 2.times.map do |index|
      Clinic::Care::LabResultFollowUps.attempt_contact(practice: @practice, actor: @actor, patient: @patient,
        report:, version:, follow_up:, request_key: "contact-prerequisite-attempt-#{index}", contact_method: "phone",
        outcome: "not_reached", attempted_at: 1.minute.ago, next_action_due_at: 1.day.from_now).value.clinical_task
    end
    prerequisite = Clinic::ClinicalTask.create!(practice: @practice, patient: @patient, encounter: @encounter,
      site: @site, task_kind: "record_request", pool_code: "clinical", state: "claimed", source_type: "manual",
      assigned_to_membership: @membership, recorded_by_membership: @membership)
    Clinic::Care::NurseWorkflow.transition_task(practice: @practice, actor: @actor, task: tasks.last,
      action: "dependencies", expected_version: tasks.last.lock_version,
      request_key: "contact-prerequisite-link", dependency_ids: [ prerequisite.id ])
    event_count = Clinic::ClinicalTaskEvent.where(task_id: tasks.map(&:id)).count
    completion = { follow_up: { request_key: "contact-prerequisite-complete", outcome: "Follow-up reviewed." } }
    post complete_follow_up_path(report, version), params: completion, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_match(/prerequisite/, response.parsed_body.fetch("error"))
    assert_equal "open", follow_up.reload.state
    assert_nil follow_up.completed_at
    assert_equal [ "claimed", "claimed" ], tasks.map { |task| task.reload.state }
    assert_equal event_count, Clinic::ClinicalTaskEvent.where(task_id: tasks.map(&:id)).count
    Clinic::Care::NurseWorkflow.transition_task(practice: @practice, actor: @actor, task: prerequisite,
      action: "complete", expected_version: prerequisite.lock_version, request_key: "contact-prerequisite-resolved",
      resolution_code: "completed")
    post complete_follow_up_path(report, version), params: completion, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "completed", follow_up.reload.state
    assert_equal [ "completed", "completed" ], tasks.map { |task| task.reload.state }
    assert_equal event_count + 2, Clinic::ClinicalTaskEvent.where(task_id: tasks.map(&:id)).count
    post complete_follow_up_path(report, version), params: completion, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal event_count + 2, Clinic::ClinicalTaskEvent.where(task_id: tasks.map(&:id)).count
  end

  test "lab contact tasks complete internal prerequisites before older dependent tasks" do
    grant_permissions!(@membership, "encounters.write")
    report = create_report(patient: @patient, key: "contact-internal-prerequisite", issued_at: Time.utc(2026, 9, 6, 18),
      title: "Internal contact prerequisite report")
    version = report.current_version
    post review_path(report, version), params: review_params("contact-internal-review").deep_merge(
      review: { follow_up_disposition: "required", follow_up_note: "Finish both contact actions." }
    ), headers: csrf_headers, as: :json
    assert_response :success
    follow_up = version.reload.follow_up
    tasks = 2.times.map do |index|
      Clinic::Care::LabResultFollowUps.attempt_contact(practice: @practice, actor: @actor, patient: @patient,
        report:, version:, follow_up:, request_key: "contact-internal-attempt-#{index}", contact_method: "phone",
        outcome: "not_reached", attempted_at: 1.minute.ago, next_action_due_at: 1.day.from_now).value.clinical_task
    end
    assert_operator tasks.first.id, :<, tasks.last.id
    Clinic::Care::NurseWorkflow.transition_task(practice: @practice, actor: @actor, task: tasks.first,
      action: "dependencies", expected_version: tasks.first.lock_version,
      request_key: "contact-internal-link", dependency_ids: [ tasks.last.id ])
    cycle = assert_raises(ArgumentError) do
      Clinic::Care::NurseWorkflow.transition_task(practice: @practice, actor: @actor, task: tasks.last,
        action: "dependencies", expected_version: tasks.last.lock_version,
        request_key: "contact-internal-cycle", dependency_ids: [ tasks.first.id ])
    end
    assert_match(/cycle/, cycle.message)
    assert_empty tasks.last.dependencies
    event_count = Clinic::ClinicalTaskEvent.where(task_id: tasks.map(&:id)).count
    completion = { follow_up: { request_key: "contact-internal-complete", outcome: "Both contact actions reviewed." } }
    post complete_follow_up_path(report, version), params: completion, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "completed", follow_up.reload.state
    assert_equal [ "completed", "completed" ], tasks.map { |task| task.reload.state }
    completed_ids = Clinic::ClinicalTaskEvent.where(task_id: tasks.map(&:id), action: "complete").order(:id).pluck(:task_id)
    assert_equal [ tasks.last.id, tasks.first.id ], completed_ids
    assert_equal [ tasks.last.id ], tasks.first.dependencies.pluck(:prerequisite_id)
    post complete_follow_up_path(report, version), params: completion, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal event_count + 2, Clinic::ClinicalTaskEvent.where(task_id: tasks.map(&:id)).count
  end

  test "routine follow-up rejects escalation due input and preserves valid retries" do
    report = create_report(patient: @patient, key: "routine-due-time", issued_at: Time.utc(2026, 9, 6, 18),
      title: "Routine due time report")
    version = report.current_version
    post review_path(report, version), params: review_params("routine-due-time-review"), headers: csrf_headers, as: :json
    assert_response :success
    decision = { follow_up: { request_key: "routine-due-time-decision", disposition: "required",
      note: "Review repeat results.", due_at: "2026-09-20T17:15:00Z" } }
    post record_follow_up_path(report, version), params: decision, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_match(/only to urgent and critical/, response.parsed_body.fetch("error"))
    assert_nil version.reload.follow_up
    decision[:follow_up].delete(:due_at)
    post record_follow_up_path(report, version), params: decision, headers: csrf_headers, as: :json
    assert_response :created
    follow_up = response.parsed_body.dig("version", "follow_up")
    assert_nil follow_up.fetch("due_at")
    assert_nil version.reload.follow_up.due_at
    post record_follow_up_path(report, version), params: decision, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal follow_up.fetch("id"), response.parsed_body.dig("version", "follow_up", "id")
    changed = decision.deep_dup
    changed[:follow_up][:due_at] = "2026-09-21T17:15:00Z"
    post record_follow_up_path(report, version), params: changed, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_match(/only to urgent and critical/, response.parsed_body.fetch("error"))
    assert_nil version.reload.follow_up.due_at
    assert_equal 1, Clinic::Care::LabResultFollowUp.where(lab_report_version: version).count
  end

  test "reviewed current versions accept one standalone decision with tenant and permission boundaries" do
    report = create_report(
      patient: @patient, key: "standalone-follow-up", issued_at: Time.utc(2026, 9, 6, 18),
      title: "Standalone follow-up report"
    )
    version = report.current_version
    post review_path(report, version), params: review_params("standalone-review"), headers: csrf_headers, as: :json
    assert_response :success
    assert_nil response.parsed_body.dig("version", "follow_up")

    decision = {
      follow_up: { request_key: "standalone-not-required", disposition: "not_required", note: "No action indicated." }
    }
    post record_follow_up_path(report, version), params: decision, headers: csrf_headers, as: :json
    assert_response :created
    first = response.parsed_body.dig("version", "follow_up")
    assert_equal "not_required", first.fetch("state")
    assert_equal "No action indicated.", first.fetch("instructions")

    post record_follow_up_path(report, version), params: decision, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal first, response.parsed_body.dig("version", "follow_up")

    foreign_actor = User.create!(email_address: "foreign-follow-up@example.invalid", password: SecureRandom.hex(18))
    foreign_membership = @other_practice.memberships.create!(user: foreign_actor)
    grant_permissions!(foreign_membership, "patients.read", "notes.read", "notes.write", "observations.write")
    foreign_report = create_report(
      practice: @other_practice, actor: foreign_actor, patient: @other_patient,
      key: "foreign-follow-up", issued_at: Time.utc(2026, 9, 6, 19), title: "Foreign follow-up report"
    )
    Clinic::Care::LabReports.review(
      practice: @other_practice, actor: foreign_actor, patient: @other_patient,
      report: foreign_report, version: foreign_report.current_version, request_key: "foreign-follow-up-review",
      confirmed_patient: true,
      follow_up: { disposition: "required", note: "Foreign instructions must remain hidden." }
    )

    get follow_up_queue_path, headers: @headers
    assert_response :success
    refute_includes JSON.generate(response.parsed_body), "Foreign instructions must remain hidden."

    post record_follow_up_path(foreign_report, foreign_report.current_version, patient: @other_patient),
      params: { follow_up: { request_key: "cross-tenant-follow-up", disposition: "required", note: "Do not record." } },
      headers: csrf_headers, as: :json
    assert_response :not_found

    second = create_report(
      patient: @patient, key: "follow-up-permission", issued_at: Time.utc(2026, 9, 6, 20),
      title: "Permission-bound follow-up report"
    )
    Clinic::Care::LabReports.review(
      practice: @practice, actor: @actor, patient: @patient, report: second, version: second.current_version,
      request_key: "follow-up-permission-review", confirmed_patient: true
    )
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.read", "notes.read")
    post record_follow_up_path(second, second.current_version),
      params: { follow_up: { request_key: "follow-up-without-write", disposition: "required", note: "Denied." } },
      headers: csrf_headers, as: :json
    assert_response :forbidden
    assert_nil second.current_version.follow_up

    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.read")
    get follow_up_queue_path, headers: @headers
    assert_response :forbidden
  end

  test "a corrected version reopens review without hiding prior patient contact" do
    report = create_report(
      patient: @patient, key: "follow-up-correction-base", issued_at: Time.utc(2026, 9, 6, 21),
      title: "Report requiring correction"
    )
    prior_version = report.current_version
    review = review_params("follow-up-before-correction").deep_merge(
      review: { follow_up_disposition: "required", follow_up_note: "Review this exact version." }
    )
    post review_path(report, prior_version), params: review, headers: csrf_headers, as: :json
    assert_response :success
    follow_up_id = response.parsed_body.dig("version", "follow_up", "id")

    append = version_params(
      request_key: "follow-up-corrected-version", expected_current_version_id: prior_version.id,
      status: "corrected", value: "5.10"
    )
    post versions_path(report), params: append, headers: csrf_headers, as: :json
    assert_response :created
    corrected_version = report.reload.current_version
    refute_equal prior_version.id, corrected_version.id
    assert_nil response.parsed_body.dig("version", "follow_up")

    prior_follow_up = prior_version.reload.follow_up
    assert_equal follow_up_id, prior_follow_up.id
    assert_equal "open", prior_follow_up.state
    assert_nil prior_follow_up.completed_at
    assert_nil corrected_version.reviewed_at

    get reports_path, headers: @headers
    assert_response :success
    summary = response.parsed_body.fetch("reports").find { |item| item.fetch("id") == report.id }
    assert_equal corrected_version.id, summary.fetch("current_version_id")
    assert_equal [{ "version_id" => prior_version.id, "version_number" => prior_version.version_number }],
      summary.fetch("open_prior_follow_ups")

    get review_queue_path, headers: @headers
    assert_response :success
    assert_includes response.parsed_body.fetch("items").pluck("report_id"), report.id
    get follow_up_queue_path, headers: @headers
    assert_response :success
    retained = response.parsed_body.fetch("items").find { |item| item.dig("follow_up", "id") == follow_up_id }
    assert_equal prior_version.id, retained.dig("version", "id")
    assert_equal corrected_version.id, retained.fetch("current_version_id")

    post complete_follow_up_path(report, prior_version),
      params: { follow_up: { request_key: "complete-prior-contact", outcome: "Corrected report reviewed; contact work resolved." } },
      headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "completed", prior_follow_up.reload.state
    assert_nil corrected_version.reload.reviewed_at
    get reports_path, headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("reports").find { |item| item.fetch("id") == report.id }.fetch("open_prior_follow_ups")
  end

  test "critical results require escalation and patient-contact closure evidence" do
    routine_report = create_report(
      patient: @patient, key: "critical-queue-routine", issued_at: Time.utc(2026, 9, 6, 8),
      title: "Older routine result"
    )
    payload = create_params(request_key: "critical-result-create")
    payload[:lab_report][:result_priority] = "critical"
    post reports_path, params: payload, headers: csrf_headers, as: :json
    assert_response :created
    report = @practice.lab_reports.find(response.parsed_body.dig("report", "id"))
    version = report.current_version

    get review_queue_path, headers: @headers
    assert_response :success
    assert_equal [ report.id, routine_report.id ], response.parsed_body.fetch("items").pluck("report_id")

    post review_path(report, version), params: review_params("critical-review-without-escalation"),
      headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_nil version.reload.reviewed_at

    post review_path(routine_report, routine_report.current_version), params: review_params("routine-queue-review").deep_merge(
      review: { follow_up_disposition: "required", follow_up_note: "Routine follow-up." }
    ), headers: csrf_headers, as: :json
    assert_response :success

    review = review_params("critical-review").deep_merge(review: {
      follow_up_disposition: "required",
      follow_up_note: "Escalate immediately to the ordering clinician.",
      follow_up_due_at: "2026-09-06T17:15:00Z"
    })
    post review_path(report, version), params: review, headers: csrf_headers, as: :json
    assert_response :success
    follow_up = response.parsed_body.dig("version", "follow_up")
    assert_equal [ "critical", "2026-09-06T17:15:00.000000Z", @membership.id ],
      follow_up.values_at("priority", "due_at", "escalated_by")
    assert follow_up.fetch("escalated_at").present?

    post review_path(report, version), params: review, headers: csrf_headers, as: :json
    assert_response :success
    changed_due = review.deep_dup
    changed_due[:review][:follow_up_due_at] = "2026-09-06T18:15:00Z"
    post review_path(report, version), params: changed_due, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "idempotency_conflict", response.parsed_body.fetch("code")
    assert_equal Time.iso8601("2026-09-06T17:15:00Z"), version.reload.follow_up.due_at

    get follow_up_queue_path, headers: @headers
    assert_response :success
    assert_equal "critical", response.parsed_body.dig("items", 0, "version", "result_priority")
    assert_equal follow_up.fetch("due_at"), response.parsed_body.dig("items", 0, "follow_up", "due_at")

    post complete_follow_up_path(report, version), params: {
      follow_up: { request_key: "critical-complete-invalid", outcome: "Clinician reviewed the result." }
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal "open", version.reload.follow_up.state

    completion = {
      follow_up: {
        request_key: "critical-complete", outcome: "Clinician reviewed the result and patient was informed.",
        patient_contact_status: "informed", patient_contact_method: "phone",
        patient_contact_at: "2026-09-06T17:10:00Z"
      }
    }
    post complete_follow_up_path(report, version), params: completion, headers: csrf_headers, as: :json
    assert_response :success
    completed = response.parsed_body.dig("version", "follow_up")
    assert_equal [ "completed", "informed", "phone", "2026-09-06T17:10:00.000000Z" ],
      completed.values_at("state", "patient_contact_status", "patient_contact_method", "patient_contact_at")
  end

  test "T07 typed and absent results round trip while receipt acknowledgment does not review or close work" do
    refute Clinic::Configuration::LabUnitMappings.snapshot(practice: @practice).fetch(:configured)
    request = create_params(request_key: "journey-partial-results")
    request[:lab_report].merge!(status: "preliminary", results: [
      { name: "Synthetic measurement", code: "1234-5", code_system: "http://loinc.org", code_version: "synthetic", value: "1.2500", value_kind: "numeric", unit: "mg/L", unit_code: "mg/L", interpretation: "H", reference_range: "Source range" },
      { name: "Synthetic coded finding", value: "Source supplied finding", value_kind: "coded", value_code: "LOCAL-1", value_code_system: "urn:synthetic:lab" },
      { name: "Synthetic pending analyte", value: "", value_kind: "absent", absent_reason: "Specimen processing continues" },
      { name: "Synthetic boolean finding", value: "true", value_kind: "boolean" },
      { name: "Synthetic interval", value: "1.0-2.5", value_kind: "range" }
    ])
    post reports_path, params: request, headers: csrf_headers, as: :json
    assert_response :created
    report = @practice.lab_reports.find(response.parsed_body.dig("report", "id"))
    version = report.current_version
    assert_equal "1.2500", version.results.first.fetch("value")
    assert_equal [ "http://loinc.org", "mg/L", "mg/L", nil, "H" ],
      version.results.first.values_at("code_system", "unit", "supplied_unit_code", "unit_code", "interpretation")
    assert_equal "unconfigured", version.results.first.dig("unit_validation", "status")
    assert_equal "urn:synthetic:lab", version.results.second.fetch("value_code_system")
    assert_equal ["", "Specimen processing continues"], version.results.third.values_at("value", "absent_reason")
    assert_equal ["boolean", "true"], version.results.fourth.values_at("value_kind", "value")
    assert_equal ["range", "1.0-2.5"], version.results.fifth.values_at("value_kind", "value")

    get "#{reports_path}/#{report.id}", headers: @headers
    assert_response :success
    saved_result = response.parsed_body.dig("report", "current_version", "results").first
    assert_equal [ "http://loinc.org", "mg/L", "mg/L", nil, "H" ],
      saved_result.values_at("code_system", "unit", "supplied_unit_code", "unit_code", "interpretation")
    assert_equal "unconfigured", saved_result.dig("unit_validation", "status")
    assert_equal saved_result, version.reload.results.first

    body = { lab_action: { kind: "acknowledged", request_key: "journey-partial-ack" } }
    assert_difference "Clinic::Care::LabReportAction.count", 1 do
      post lab_actions_path(report, version), params: body, headers: csrf_headers, as: :json
      assert_response :created
    end
    assert_no_difference ["Clinic::Care::LabReportAction.count", "Clinic::Care::LabResultFollowUp.count"] do
      post lab_actions_path(report, version), params: body, headers: csrf_headers, as: :json
      assert_response :created
    end
    assert_nil version.reload.reviewed_at
    assert_nil version.follow_up
    post review_path(report, version), params: review_params("journey-review-available-results"), headers: csrf_headers, as: :json
    assert_response :success
    assert version.reload.reviewed_at
    assert_nil version.follow_up

    grant_permissions!(@membership, "service_requests.write", "clinical_records.read")
    assert_raises(ArgumentError) do
      Clinic::Care::ClinicalPlanWorkflow.revise(kind: :service_requests, series_id: @lab_order.series_id,
        practice: @practice, actor: @actor, patient: @patient, encounter: @encounter,
        attributes: { status: "completed" }, expected_version: @lab_order.version_number, request_key: "journey-missing-result-cannot-complete")
    end
    independent = Clinic::Care::ClinicalPlanWorkflow.create(kind: :service_requests, practice: @practice, actor: @actor,
      patient: @patient, encounter: @encounter, request_key: "journey-independent-preparation",
      attributes: { request_kind: "referral", requested_display: "Synthetic independent referral", priority: "routine", intent: "plan" })
    assert_equal "draft", independent.status
    assert_equal @patient.id, independent.patient_id
    assert_nil @encounter.reload.ended_at
  end

  test "T07 missing numeric coded and absent evidence rejects without adding report versions" do
    cases = [
      { name: "Synthetic numeric", value: "not a number", value_kind: "numeric" },
      { name: "Synthetic coded", value: "Meaning", value_kind: "coded", value_code: "X" },
      { name: "Synthetic absent", value: "", value_kind: "absent" },
      { name: "Synthetic contradictory", value: "7", value_kind: "absent", absent_reason: "Missing" }
    ]
    cases.each_with_index do |result, index|
      request = create_params(request_key: "journey-invalid-result-#{index}")
      request[:lab_report][:results] = [result]
      assert_no_difference ["Clinic::Care::LabReport.count", "Clinic::Care::LabReportVersion.count"] do
        post reports_path, params: request, headers: csrf_headers, as: :json
        assert_response :unprocessable_entity
      end
    end
  end

  test "T07 rejected specimen owns one recollection task and requires later same-order evidence after encounter closure" do
    request = create_params(request_key: "journey-rejected-specimen")
    request[:lab_report].merge!(specimen_condition: "rejected", status: "preliminary",
      results: [{ name: "Synthetic requested test", value: "", value_kind: "absent", absent_reason: "Specimen rejected by source" }])
    assert_difference "Clinic::ClinicalTask.count", 1 do
      post reports_path, params: request, headers: csrf_headers, as: :json
      assert_response :created
    end
    report = @practice.lab_reports.find(response.parsed_body.dig("report", "id"))
    version = report.current_version
    action = Clinic::Care::LabReportAction.find_by!(lab_report_version: version, kind: "recollection_requested")
    task = action.clinical_task
    assert_equal ["open", "clinical", "lab_follow_up", action.id], [task.state, task.pool_code, task.source_type, task.source_id]
    assert_equal @patient.id, task.patient_id
    assert_no_difference ["Clinic::ClinicalTask.count", "Clinic::Care::LabReportAction.count"] do
      post reports_path, params: request, headers: csrf_headers, as: :json
      assert_response :success
    end
    completion = { lab_action: { kind: "recollection_completed", note: "Later satisfactory specimen received",
      replacement_report_id: report.id, request_key: "journey-recollection-invalid" } }
    post lab_actions_path(report, version), params: completion, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal "open", task.reload.state
    replacement = create_params(request_key: "journey-recollection-report")
    replacement[:lab_report].merge!(external_report_id: "ACCN-RECOLLECTED", specimen_identifier: "SPEC-RECOLLECTED",
      collected_at: "2026-09-07T14:00:00Z", issued_at: "2026-09-07T16:00:00Z")
    post reports_path, params: replacement, headers: csrf_headers, as: :json
    assert_response :created
    replacement_id = response.parsed_body.dig("report", "id")
    @encounter.close!(ended_at: Time.utc(2026, 9, 7, 17))
    completion[:lab_action].merge!(replacement_report_id: replacement_id, request_key: "journey-recollection-complete")
    assert_no_difference "Clinic::ClinicalTask.count" do
      post lab_actions_path(report, version), params: completion, headers: csrf_headers, as: :json
      assert_response :created
    end
    assert_equal "completed", task.reload.state
    assert_equal @membership.id, task.completed_by_membership_id
    assert_nil version.reload.reviewed_at
    assert_no_difference "Clinic::Care::LabReportAction.count" do
      post lab_actions_path(report, version), params: completion, headers: csrf_headers, as: :json
      assert_response :created
    end
  end

  test "T07 correction reopens original order responsibility and does not reuse an old acknowledgment after closure" do
    post reports_path, params: create_params(request_key: "journey-correction-base"), headers: csrf_headers, as: :json
    assert_response :created
    report = @practice.lab_reports.find(response.parsed_body.dig("report", "id"))
    first = report.current_version
    post lab_actions_path(report, first), params: { lab_action: { kind: "acknowledged", request_key: "journey-ack-first" } }, headers: csrf_headers, as: :json
    assert_response :created
    post review_path(report, first), params: review_params("journey-review-first"), headers: csrf_headers, as: :json
    assert_response :success
    task = Clinic::ClinicalTask.create!(practice: @practice, patient: @patient, encounter: @encounter, site: @site,
      task_kind: "order_execution", state: "completed", pool_code: "clinical", source_type: "order",
      source_kind: "service_request", source_id: @lab_order.id, recorded_by_membership: @membership,
      resolution_code: "completed", completed_by_membership: @membership, completed_at: Time.utc(2026, 9, 6, 17))
    @encounter.close!(ended_at: Time.utc(2026, 9, 6, 18))
    correction = version_params(request_key: "journey-corrected-version", expected_current_version_id: first.id, status: "corrected", value: "4.90")
    assert_no_difference "Clinic::ClinicalTask.count" do
      post versions_path(report), params: correction, headers: csrf_headers, as: :json
      assert_response :created
    end
    current = report.reload.current_version
    assert_equal "open", task.reload.state
    assert_nil task.completed_at
    assert_nil current.reviewed_at
    assert first.reload.reviewed_at
    assert_equal "4.70", first.results.sole.fetch("value")
    assert_equal "4.90", current.results.sole.fetch("value")
    assert_empty Clinic::Care::LabReportAction.where(lab_report_version: current)
    post lab_actions_path(report, first), params: { lab_action: { kind: "acknowledged", request_key: "journey-obsolete-ack" } }, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_no_difference ["Clinic::ClinicalTask.count", "Clinic::Care::LabReportVersion.count"] do
      post versions_path(report), params: correction, headers: csrf_headers, as: :json
      assert_response :success
    end
    get review_queue_path, headers: @headers
    assert_response :success
    assert_includes response.parsed_body.fetch("items").pluck("report_id"), report.id
  end

  test "T07 acknowledgment rejects another patient and a role without current report-write authority" do
    post reports_path, params: create_params(request_key: "journey-ack-access"), headers: csrf_headers, as: :json
    assert_response :created
    report = @practice.lab_reports.find(response.parsed_body.dig("report", "id"))
    version = report.current_version
    body = { lab_action: { kind: "acknowledged", request_key: "journey-ack-denied" } }
    post "/api/clinic/patients/#{@other_patient.id}/lab_reports/#{report.id}/versions/#{version.id}/actions",
      params: body, headers: csrf_headers, as: :json
    assert_response :not_found
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.read", "notes.read")
    assert_no_difference "Clinic::Care::LabReportAction.count" do
      post lab_actions_path(report, version), params: body, headers: csrf_headers, as: :json
      assert_response :forbidden
    end
    other_site = @practice.sites.create!(code: "OTHER-JOURNEY-LAB")
    grant_permissions!(@membership, "notes.write", scope_kind: "site", site: other_site)
    assert_no_difference "Clinic::Care::LabReportAction.count" do
      post lab_actions_path(report, version), params: body, headers: csrf_headers, as: :json
      assert_response :forbidden
    end
    assert_nil version.reload.reviewed_at
  end

  test "T07 T10 closed-encounter corrected results reconcile the same order task only after review and prerequisites" do
    grant_permissions!(@membership, "service_requests.write", "clinical_records.read", "encounters.write")
    task = Clinic::ClinicalTask.create!(practice: @practice, patient: @patient, encounter: @encounter, site: @site,
      task_kind: "order_execution", state: "open", pool_code: "clinical", source_type: "order",
      source_kind: "service_request", source_id: @lab_order.id, recorded_by_membership: @membership)
    post reports_path, params: create_params(request_key: "journey-reconcile-base"), headers: csrf_headers, as: :json
    assert_response :created
    report = @practice.lab_reports.find(response.parsed_body.dig("report", "id"))
    first = report.current_version
    post review_path(report, first), params: review_params("journey-reconcile-base-review"), headers: csrf_headers, as: :json
    assert_response :success
    order_path = "/api/clinic/patients/#{@patient.id}/encounters/#{@encounter.id}/service_requests/#{@lab_order.series_id}"
    patch order_path, params: { service_request: { status: "completed", expected_version: @lab_order.version_number,
      request_key: "journey-reconcile-initial-completion" } }, headers: csrf_headers, as: :json
    assert_response :created
    completed = response.parsed_body.fetch("service_request")
    assert_equal "completed", task.reload.state
    @encounter.close!
    correction = version_params(request_key: "journey-reconcile-correction", expected_current_version_id: first.id,
      status: "corrected", value: "4.90")
    assert_no_difference "Clinic::ClinicalTask.count" do
      post versions_path(report), params: correction, headers: csrf_headers, as: :json
      assert_response :created
    end
    current = report.reload.current_version
    assert_equal "open", task.reload.state
    assert_nil current.reviewed_at
    request = { service_request: { reconcile_completion: true, expected_version: completed.fetch("version_number"),
      request_key: "journey-reconcile-current" } }
    assert_no_difference "Clinic::Care::ServiceRequestRevision.count" do
      patch order_path, params: request, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
      assert_match(/lab results remain pending/, response.parsed_body.fetch("error"))
    end
    post review_path(report, current), params: review_params("journey-reconcile-current-review"), headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "open", task.reload.state
    prerequisite = Clinic::ClinicalTask.create!(practice: @practice, patient: @patient, encounter: @encounter, site: @site,
      task_kind: "record_request", state: "claimed", pool_code: "clinical", source_type: "manual",
      assigned_to_membership: @membership, recorded_by_membership: @membership)
    patch "/api/clinic/clinical_tasks/#{task.id}", params: { task: { action: "dependencies", dependency_ids: [prerequisite.id],
      expected_version: task.lock_version, request_key: "journey-reconcile-dependency" } }, headers: csrf_headers, as: :json
    assert_response :success
    assert_no_difference "Clinic::Care::ServiceRequestRevision.count" do
      patch order_path, params: request, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
      assert_match(/prerequisite/, response.parsed_body.fetch("error"))
    end
    independent = Clinic::ClinicalTask.create!(practice: @practice, patient: @patient, encounter: @encounter, site: @site,
      task_kind: "patient_call", state: "claimed", pool_code: "clinical", source_type: "manual",
      assigned_to_membership: @membership, recorded_by_membership: @membership)
    [independent, prerequisite].each do |work|
      patch "/api/clinic/clinical_tasks/#{work.id}", params: { task: { action: "complete", resolution_code: "completed",
        expected_version: work.lock_version, request_key: "journey-reconcile-manual-#{work.id}" } }, headers: csrf_headers, as: :json
      assert_response :success
      assert_equal "completed", work.reload.state
      assert_equal "open", task.reload.state
    end
    assert_no_difference "Clinic::ClinicalTask.count" do
      assert_difference "Clinic::Care::ServiceRequestRevision.count", 1 do
        patch order_path, params: request, headers: csrf_headers, as: :json
        assert_response :created
      end
    end
    reconciled = response.parsed_body.fetch("service_request")
    assert_equal completed.fetch("version_number") + 1, reconciled.fetch("version_number")
    assert_equal false, reconciled.fetch("completion_reconciliation_required")
    assert_equal "completed", task.reload.state
    assert @encounter.reload.ended_at
    assert_no_difference ["Clinic::Care::ServiceRequestRevision.count", "Clinic::ClinicalTask.count"] do
      patch order_path, params: request, headers: csrf_headers, as: :json
      assert_response :created
      assert_equal reconciled.fetch("id"), response.parsed_body.dig("service_request", "id")
    end
    request[:service_request][:request_key] = "journey-reconcile-obsolete"
    patch order_path, params: request, headers: csrf_headers, as: :json
    assert_response :conflict
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.read", "clinical_records.read")
    request[:service_request][:request_key] = "journey-reconcile-current"
    patch order_path, params: request, headers: csrf_headers, as: :json
    assert_response :forbidden
    assert_equal "completed", task.reload.state
  end

  private

  def lab_actions_path(report, version)
    "#{versions_path(report)}/#{version.id}/actions"
  end

  def reports_path(patient: @patient)
    "/api/clinic/patients/#{patient.id}/lab_reports"
  end

  def versions_path(report)
    "#{reports_path}/#{report.id}/versions"
  end

  def review_path(report, version)
    "#{versions_path(report)}/#{version.id}/review"
  end

  def review_queue_path
    "/api/clinic/lab_reports/review_queue"
  end

  def follow_up_queue_path
    "/api/clinic/lab_reports/follow_up_queue"
  end

  def record_follow_up_path(report, version, patient: @patient)
    "/api/clinic/patients/#{patient.id}/lab_reports/#{report.id}/versions/#{version.id}/follow_up"
  end

  def complete_follow_up_path(report, version, patient: @patient)
    "#{record_follow_up_path(report, version, patient:)}/complete"
  end

  def create_report(practice: @practice, actor: @actor, patient: @patient, key:, issued_at:, title:, results: nil)
    membership = practice.memberships.find_by!(user: actor)
    site = practice == @practice ? @site : practice.sites.first_or_create!(code: "LAB")
    encounter = practice.encounters.where(patient:, site:).first_or_create!(
      started_at: issued_at - 2.hours, status: "open"
    )
    order = create_lab_order(practice:, patient:, encounter:, membership:, key: "order-#{key}")
    Clinic::Care::LabReports.create(
      practice: practice,
      actor: actor,
      patient: patient,
      request_key: key,
      confirmed_patient: true,
      source_name: "Queue laboratory",
      external_report_id: key,
      service_request_revision_id: order.id,
      specimen: {
        specimen_identifier: "specimen-#{key}", specimen_type_code: "venous-blood",
        specimen_type_display: "Venous blood", condition_code: "satisfactory"
      },
      version: lab_version_attributes(issued_at:, title:, results:)
    ).value
  end

  def create_lab_order(practice:, patient:, encounter:, membership:, key:)
    Clinic::Care::ServiceRequestRevision.create!(
      practice:, patient:, encounter:, site: encounter.site, series_id: SecureRandom.uuid, version_number: 1,
      status: "active", recorded_by_membership: membership, recorded_at: Time.utc(2026, 9, 6, 12),
      request_key: key, content_digest: Digest::SHA256.hexdigest(key), request_kind: "lab", intent: "order",
      priority: "routine", requested_display: "Complete blood count", destination: "External laboratory"
    )
  end

  def lab_version_attributes(issued_at:, title:, status: "final", results: nil)
    {
      title: title,
      status: status,
      collected_at: issued_at - 1.hour,
      issued_at: issued_at,
      results: results || [ { name: "Queue result", value: "recorded" } ]
    }
  end

  def create_params(request_key:)
    {
      lab_report: {
        request_key:, confirmed_patient: true, source_name: "Community laboratory",
        external_report_id: "ACCN-1042", service_request_revision_id: @lab_order.id,
        specimen_identifier: "SPEC-1042", specimen_type_code: "venous-blood",
        specimen_type_display: "Venous blood", specimen_condition: "satisfactory",
        title: "Complete blood count", status: "final", result_priority: "routine",
        collected_at: "2026-09-06T14:00:00Z", issued_at: "2026-09-06T16:00:00Z",
        results: [
          { name: "White blood cells", code: "WBC", value: "4.70", unit: "10^3/uL", reference_range: "4.0-11.0", flag: "reported normal" }
        ]
      }
    }
  end

  def version_params(request_key:, expected_current_version_id:, status:, value:)
    {
      lab_report_version: {
        request_key:, confirmed_patient: true, expected_current_version_id:,
        title: "Complete blood count", status:, result_priority: "routine",
        collected_at: "2026-09-06T14:00:00Z", issued_at: "2026-09-06T17:00:00Z",
        results: [
          { name: "White blood cells", code: "WBC", value:, unit: "10^3/uL", reference_range: "4.0-11.0", flag: "reported normal" }
        ]
      }
    }
  end

  def review_params(request_key)
    { review: { request_key:, confirmed_patient: true } }
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
