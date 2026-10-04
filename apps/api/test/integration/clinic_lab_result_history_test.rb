require "test_helper"

class ClinicLabResultHistoryTest < ActionDispatch::IntegrationTest
  setup do
    organization = Organization.create!(name: "Lab history test organization")
    @practice = Clinic::Practice.create!(name: "Lab history practice", organization: organization, timezone: "UTC")
    @other_practice = Clinic::Practice.create!(name: "Other lab history practice", organization: organization, timezone: "UTC")
    @password = SecureRandom.hex(18)
    @actor = User.create!(email_address: "lab-history@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "patients.read", "notes.read")
    @patient = @practice.patients.create!(display_name: "Lab History Patient", reference: "LAB-HISTORY")
    @other_patient = @practice.patients.create!(display_name: "Other Lab History Patient", reference: "LAB-HISTORY-OTHER")
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    post "/api/session", params: { email_address: @actor.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  test "matches source name analyte code and unit while using only current noncancelled versions" do
    selected = create_report(
      source_name: "Community Laboratory",
      collected_at: Time.utc(2026, 9, 6, 10),
      result: result(name: "White blood cells", code: "WBC", value: "4.7", unit: "10^3/uL")
    )
    matching = create_report(
      source_name: "community laboratory",
      collected_at: Time.utc(2026, 9, 5, 10),
      result: result(name: "WHITE BLOOD CELLS", code: "WBC", value: "4.5", unit: "10^3/uL")
    )
    corrected = create_report(
      source_name: "Community Laboratory",
      collected_at: Time.utc(2026, 9, 4, 10),
      result: result(name: "White blood cells", code: "WBC", value: "old-value", unit: "10^3/uL")
    )
    old_version = corrected.current_version
    corrected_version = append_version(
      corrected,
      status: "corrected",
      result: result(name: "White blood cells", code: "WBC", value: "4.3", unit: "10^3/uL")
    )
    create_report(
      source_name: "Community Laboratory",
      collected_at: Time.utc(2026, 9, 3, 10),
      result: result(name: "White blood cells", code: "WBC", value: "wrong-unit", unit: "10^9/L")
    )
    create_report(
      source_name: "Different Laboratory",
      collected_at: Time.utc(2026, 9, 2, 10),
      result: result(name: "White blood cells", code: "WBC", value: "wrong-source", unit: "10^3/uL")
    )
    create_report(
      source_name: "Community Laboratory",
      collected_at: Time.utc(2026, 9, 1, 10),
      status: "cancelled",
      result: result(name: "White blood cells", code: "WBC", value: "cancelled-value", unit: "10^3/uL")
    )

    get history_path(selected), params: { page: 1, per_page: 2 }, headers: @headers
    assert_response :success
    payload = response.parsed_body
    assert_equal({
      "report_id" => selected.id,
      "version_id" => selected.current_version_id,
      "result_index" => 0,
      "name" => "White blood cells",
      "code" => "WBC",
      "code_system" => nil,
      "unit" => "10^3/uL",
      "unit_code" => nil,
      "supplied_unit_code" => nil,
      "source_name" => "Community Laboratory"
    }, payload.fetch("selected"))
    assert_equal({ "page" => 1, "per_page" => 2, "total" => 3 }, payload.fetch("pagination"))
    assert_equal [selected.id, matching.id], payload.fetch("items").map { |item| item.fetch("report_id") }

    get history_path(selected), params: { page: 2, per_page: 2 }, headers: @headers
    assert_response :success
    item = response.parsed_body.fetch("items").sole
    assert_equal corrected.id, item.fetch("report_id")
    assert_equal corrected_version.id, item.fetch("version_id")
    assert_equal "4.3", item.fetch("value")
    assert_equal "corrected", item.fetch("status")
    refute_includes response.body, "old-value"
    refute_equal old_version.id, item.fetch("version_id")
    assert_equal({ "reports_searched" => 5, "total_reports" => 5, "truncated" => false },
      response.parsed_body.fetch("coverage"))
    assert_equal 2, @practice.audit_events.where(
      action_code: "lab_report.result_history.read", outcome: "released"
    ).count
  end

  test "coded lab history keeps test systems and UCUM units distinct" do
    source = result(name: "Synthetic analyte", code: "X1", value: "2", unit: "units")
      .merge("code_system" => "urn:synthetic:system-a", "unit_code" => "mg")
    selected = create_report(source_name: "Synthetic lab", collected_at: Time.utc(2026, 9, 6), result: source)
    match = create_report(source_name: "Synthetic lab", collected_at: Time.utc(2026, 9, 5), result: source.merge("value" => "3"))
    create_report(source_name: "Synthetic lab", collected_at: Time.utc(2026, 9, 4),
      result: source.merge("value" => "wrong test", "code_system" => "urn:synthetic:system-b"))
    create_report(source_name: "Synthetic lab", collected_at: Time.utc(2026, 9, 3),
      result: source.merge("value" => "wrong unit", "unit_code" => "g"))

    get history_path(selected), headers: @headers
    assert_response :success
    assert_equal "urn:synthetic:system-a", response.parsed_body.dig("selected", "code_system")
    assert_nil response.parsed_body.dig("selected", "unit_code")
    assert_equal "mg", response.parsed_body.dig("selected", "supplied_unit_code")
    assert_equal [selected.id, match.id], response.parsed_body.fetch("items").map { |item| item.fetch("report_id") }
  end

  test "blank codes match only blank codes and stale tenant patient and capability targets are rejected" do
    selected = create_report(
      source_name: "Reference Laboratory",
      collected_at: Time.utc(2026, 9, 6, 12),
      result: result(name: "Sedimentation rate", code: nil, value: "12", unit: "mm/hr")
    )
    blank_match = create_report(
      source_name: " reference laboratory ",
      collected_at: Time.utc(2026, 9, 5, 12),
      result: result(name: "SEDIMENTATION RATE", code: " ", value: "10", unit: "mm/hr")
    )
    create_report(
      source_name: "Reference Laboratory",
      collected_at: Time.utc(2026, 9, 4, 12),
      result: result(name: "Sedimentation rate", code: "ESR", value: "11", unit: "mm/hr")
    )

    get history_path(selected), headers: @headers
    assert_response :success
    assert_nil response.parsed_body.dig("selected", "code")
    assert_equal [selected.id, blank_match.id],
      response.parsed_body.fetch("items").map { |item| item.fetch("report_id") }

    stale_version = selected.current_version
    append_version(selected, status: "amended", result: result(
      name: "Sedimentation rate", code: nil, value: "13", unit: "mm/hr"
    ))
    get history_path(selected, version: stale_version), headers: @headers
    assert_response :conflict
    assert_equal "stale_record", response.parsed_body.fetch("code")

    other_report = create_report(
      patient: @other_patient,
      source_name: "Reference Laboratory",
      collected_at: Time.utc(2026, 9, 3, 12),
      result: result(name: "Sedimentation rate", code: nil, value: "9", unit: "mm/hr")
    )
    get history_path(other_report, patient: @patient), headers: @headers
    assert_response :not_found

    foreign_patient = @other_practice.patients.create!(display_name: "Foreign Lab Patient", reference: "FOREIGN-LAB")
    foreign_actor = User.create!(email_address: "foreign-lab-history@example.invalid", password: SecureRandom.hex(18))
    foreign_membership = @other_practice.memberships.create!(user: foreign_actor)
    foreign_report = create_report(
      practice: @other_practice,
      patient: foreign_patient,
      member: foreign_membership,
      source_name: "Reference Laboratory",
      collected_at: Time.utc(2026, 9, 2, 12),
      result: result(name: "Sedimentation rate", code: nil, value: "8", unit: "mm/hr")
    )
    get history_path(foreign_report, patient: foreign_patient), headers: @headers
    assert_response :not_found

    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.read")
    get history_path(selected, version: selected.current_version), headers: @headers
    assert_response :forbidden
  end

  test "scan coverage is capped while always including an older selected report" do
    selected = create_report(
      source_name: "Bounded Laboratory",
      collected_at: Time.utc(2026, 1, 1, 10),
      result: result(name: "Selected analyte", code: "SEL", value: "selected", unit: "unit")
    )
    101.times do |index|
      create_report(
        source_name: "Bounded Laboratory",
        collected_at: Time.utc(2026, 2, 1, 10) + index.hours,
        result: result(name: "Other analyte", code: "OTHER", value: index.to_s, unit: "unit")
      )
    end

    get history_path(selected), headers: @headers
    assert_response :success
    assert_equal [selected.id], response.parsed_body.fetch("items").map { |item| item.fetch("report_id") }
    assert_equal({ "reports_searched" => 101, "total_reports" => 102, "truncated" => true },
      response.parsed_body.fetch("coverage"))

    get history_path(selected), params: { per_page: 26 }, headers: @headers
    assert_response :bad_request
    get history_path(selected, result_index: 1), headers: @headers
    assert_response :not_found
    get history_path(selected, result_index: -1), headers: @headers
    assert_response :bad_request
  end

  private

  def result(name:, code:, value:, unit:)
    {
      "name" => name,
      "code" => code,
      "value" => value,
      "unit" => unit,
      "reference_range" => nil,
      "flag" => nil
    }
  end

  def create_report(source_name:, collected_at:, result:, practice: @practice, patient: @patient,
    member: @membership, status: "final")
    report = practice.lab_reports.create!(
      patient: patient,
      source_name: source_name,
      external_report_id: "history-#{practice.id}-#{patient.id}-#{SecureRandom.hex(8)}"
    )
    version = report.report_versions.create!(
      practice: practice,
      patient: patient,
      version_number: 1,
      title: "Historical lab report",
      status: status,
      collected_at: collected_at,
      issued_at: collected_at + 1.hour,
      results_payload: JSON.generate([result]),
      entry_kind: "manual",
      content_digest: Digest::SHA256.hexdigest(JSON.generate([result])),
      recorded_by_membership: member,
      recorded_at: collected_at + 1.hour
    )
    report.update!(current_version: version)
    report
  end

  def append_version(report, status:, result:)
    current = report.current_version
    version = report.report_versions.create!(
      practice: report.practice,
      patient: report.patient,
      version_number: current.version_number + 1,
      title: "Corrected historical lab report",
      status: status,
      collected_at: current.collected_at,
      issued_at: current.issued_at + 1.hour,
      results_payload: JSON.generate([result]),
      entry_kind: "manual",
      content_digest: Digest::SHA256.hexdigest(JSON.generate([result])),
      recorded_by_membership: @membership,
      recorded_at: current.recorded_at + 1.hour
    )
    report.update!(current_version: version)
    version
  end

  def history_path(report, patient: @patient, version: report.current_version, result_index: 0)
    "/api/clinic/patients/#{patient.id}/lab_reports/#{report.id}/versions/#{version.id}/results/#{result_index}/history"
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
