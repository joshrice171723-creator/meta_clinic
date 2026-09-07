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
