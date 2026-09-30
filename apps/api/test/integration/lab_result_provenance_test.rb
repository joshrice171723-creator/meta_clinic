require "test_helper"

class LabResultProvenanceTest < ActionDispatch::IntegrationTest
  setup do
    @practice = Clinic::Practice.create!(name: "Synthetic lab provenance", timezone: "UTC")
    password = SecureRandom.hex(18)
    @actor = User.create!(email_address: "lab-provenance@example.invalid", password:)
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "patients.read", "notes.read", "notes.write", "observations.write")
    @site = @practice.sites.create!(code: "LAB")
    @patient = @practice.patients.create!(display_name: "Synthetic provenance patient", reference: "PROV-1")
    @encounter = @practice.encounters.create!(patient: @patient, site: @site, started_at: Time.utc(2026, 9, 6, 12), status: "open")
    @order = Clinic::Care::ServiceRequestRevision.create!(practice: @practice, patient: @patient, encounter: @encounter,
      site: @site, series_id: SecureRandom.uuid, version_number: 1, status: "active", recorded_by_membership: @membership,
      recorded_at: Time.utc(2026, 9, 6, 12), request_key: SecureRandom.uuid, content_digest: Digest::SHA256.hexdigest("synthetic"),
      request_kind: "lab", intent: "order", priority: "routine", requested_display: "Source test", destination: "Source laboratory")
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000" }
    post "/api/session", params: { email_address: @actor.email_address, password: }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "source provenance survives protected create reload history and exact replay without inference" do
    input = create_input
    post reports_path, params: input, headers: csrf_headers, as: :json
    assert_response :created
    payload = response.parsed_body.fetch("report")
    report = @practice.lab_reports.find(payload.fetch("id"))
    version = report.current_version
    assert_equal metadata.stringify_keys, version.results.sole.slice(*metadata.keys.map(&:to_s))
    assert_equal "1.2500", version.results.sole.fetch("value")
    refute_includes version.read_attribute_before_type_cast(:results_payload), "Synthetic performing laboratory"
    get "#{reports_path}/#{report.id}"
    assert_response :success
    assert_equal metadata.stringify_keys, response.parsed_body.dig("report", "current_version", "results", 0).slice(*metadata.keys.map(&:to_s))
    get "#{reports_path}/#{report.id}/versions/#{version.id}/results/0/history"
    assert_response :success
    assert_equal metadata.stringify_keys, response.parsed_body.fetch("items").sole.slice(*metadata.keys.map(&:to_s))
    post reports_path, params: input, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal report.id, response.parsed_body.dig("report", "id")
    assert_equal 1, report.report_versions.count
    input[:lab_report][:results][0][:method] = "Different source method"
    post reports_path, params: input, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "idempotency_conflict", response.parsed_body.fetch("code")
  end

  test "correction preserves old metadata and new version source provenance stays independently unreviewed" do
    post reports_path, params: create_input, headers: csrf_headers, as: :json
    assert_response :created
    report = @practice.lab_reports.find(response.parsed_body.dig("report", "id"))
    prior = report.current_version
    correction = version_input.merge(status: "corrected", results: [ result.merge(method: "Synthetic corrected method", resulted_at: "2026-09-06T17:30:00+02:00") ])
    post "#{reports_path}/#{report.id}/versions", params: { lab_report_version: correction.merge(request_key: SecureRandom.uuid, confirmed_patient: true, expected_current_version_id: prior.id) }, headers: csrf_headers, as: :json
    assert_response :created
    current = report.reload.current_version
    assert_equal "Synthetic corrected method", current.results.sole.fetch("method")
    assert_equal metadata[:method], prior.reload.results.sole.fetch("method")
    assert_equal metadata[:resulted_at], prior.results.sole.fetch("resulted_at")
    assert_nil current.reviewed_at
    refute_equal prior.content_digest, current.content_digest
    original_payload = prior.results_payload
    begin
      prior.update(results_payload: "[]")
    rescue ActiveRecord::ReadonlyAttributeError
      # Rails may reject assignment before the model's immutable-version guard.
    end
    assert_equal original_payload, prior.reload.results_payload
    get "#{reports_path}/#{report.id}"
    assert_response :success
    assert_equal 2, response.parsed_body.dig("report", "versions").length
  end

  test "missing optional fields remain missing and blank metadata does not change legacy normalized content" do
    plain = result.except(*metadata.keys)
    without = Clinic::Care::LabReports.send(:normalize_version, version_input.merge(results: [ plain ]))
    blanks = Clinic::Care::LabReports.send(:normalize_version, version_input.merge(results: [ plain.merge(metadata.keys.index_with { " " }) ]))
    assert_equal without[:content_digest], blanks[:content_digest]
    metadata.keys.each { |field| refute without[:results].sole.key?(field.to_s) }
  end

  test "invalid supplied timestamps or oversized organization are rejected with no report write" do
    [ { resulted_at: "not a time" }, { resulted_at: "2026-02-30T15:30:00Z" }, { received_at: "2026-09-06T15:30:00" }, { performing_organization: "X" * 201 } ].each do |invalid|
      input = create_input
      input[:lab_report][:results] = [ result.merge(invalid) ]
      before = [ Clinic::Care::LabReport.count, Clinic::Care::LabReportVersion.count, Clinic::Care::LabSpecimen.count ]
      post reports_path, params: input, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
      assert_equal before, [ Clinic::Care::LabReport.count, Clinic::Care::LabReportVersion.count, Clinic::Care::LabSpecimen.count ]
      assert_nil response.parsed_body["report"]
    end
  end

  test "new metadata does not bypass site authority or patient and practice context" do
    @membership.role_grants.find_each { |grant| grant.update!(revoked_at: Time.current) }
    grant_permissions!(@membership, "patients.read", "notes.read")
    post reports_path, params: create_input, headers: csrf_headers, as: :json
    assert_response :forbidden
    assert_equal 0, Clinic::Care::LabReport.where(practice: @practice).count
    grant_permissions!(@membership, "observations.write")
    foreign = Clinic::Practice.create!(name: "Foreign provenance", timezone: "UTC").patients.create!(display_name: "Foreign synthetic", reference: "FOREIGN")
    post "/api/clinic/patients/#{foreign.id}/lab_reports", params: create_input, headers: csrf_headers, as: :json
    assert_response :not_found
    assert_equal 0, Clinic::Care::LabReport.where(practice: @practice).count
  end

  private

  def metadata
    { performing_organization: "Synthetic performing laboratory", issuing_organization: "Synthetic issuing laboratory",
      method: "Source supplied assay", resulted_at: "2026-09-06T10:30:00.1200-05:00", received_at: "2026-09-06T16:15:00+00:00" }
  end

  def result
    { name: "Synthetic source measurement", value: "1.2500", value_kind: "numeric", unit: "mg/L", unit_code: "mg/L" }.merge(metadata)
  end

  def version_input
    { title: "Synthetic report", status: "final", result_priority: "routine", collected_at: "2026-09-06T14:00:00Z",
      issued_at: "2026-09-06T16:00:00Z", results: [ result ] }
  end

  def create_input
    { lab_report: version_input.merge(request_key: SecureRandom.uuid, confirmed_patient: true, source_name: "Synthetic source report",
      external_report_id: "SYN-1", service_request_revision_id: @order.id, specimen_identifier: "SYN-SPEC",
      specimen_type_code: "source-specimen", specimen_type_display: "Source specimen", specimen_condition: "satisfactory") }
  end

  def reports_path
    "/api/clinic/patients/#{@patient.id}/lab_reports"
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
