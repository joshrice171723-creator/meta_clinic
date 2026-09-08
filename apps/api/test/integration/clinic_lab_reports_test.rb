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
    @patient = @practice.patients.create!(display_name: "Lab Report Patient", reference: "LAB-001")
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

  test "a corrected version supersedes only the open prior-version follow-up" do
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

    superseded = prior_version.reload.follow_up
    assert_equal follow_up_id, superseded.id
    assert_equal "superseded", superseded.state
    assert superseded.superseded_at.present?
    assert_nil superseded.completed_at
    assert_nil superseded.completed_by_membership_id

    post complete_follow_up_path(report, prior_version),
      params: { follow_up: { request_key: "complete-stale-follow-up", outcome: "Must not complete." } },
      headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "stale_record", response.parsed_body.fetch("code")
    assert_equal "superseded", superseded.reload.state
    assert @practice.audit_events.exists?(action_code: "lab_report.follow_up.supersede", outcome: "committed")
  end

  private

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
    Clinic::Care::LabReports.create(
      practice: practice,
      actor: actor,
      patient: patient,
      request_key: key,
      confirmed_patient: true,
      source_name: "Queue laboratory",
      external_report_id: key,
      version: lab_version_attributes(issued_at:, title:, results:)
    ).value
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
        external_report_id: "ACCN-1042", title: "Complete blood count", status: "final",
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
        title: "Complete blood count", status:,
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
