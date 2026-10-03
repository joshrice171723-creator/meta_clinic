require "test_helper"
require "csv"

class OperationalReportSiteAttributionTest < ActionDispatch::IntegrationTest
  MARKER = "SYNTHETIC-SOURCE-CONTENT-NOT-FOR-REPORTS".freeze

  setup do
    travel_to Time.utc(2026, 10, 3, 12)
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    password = SecureRandom.hex(20)
    @actor = User.create!(email_address: "report-origins@example.invalid", password:)
    @practice = Clinic::Practice.create!(name: "Operational report origins", timezone: "UTC")
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "billing.read", "scribe.read", "inventory.read", "inventory.receive",
      "inventory.adjust", "facilities.read", "facilities.write", effective_from: 1.year.ago)
    @patient = @practice.patients.create!(display_name: "Shared report patient", reference: "REPORT-ORIGINS")
    @weight = configured_site("W", "Weight, Clinic", "weight_loss")
    @behavioral = configured_site("B", "Behavioral Health", "behavioral_health")
    post "/api/session", params: { email_address: @actor.email_address, password: }, headers: csrf_headers, as: :json
    assert_response :success
  end

  teardown { travel_back }

  test "collection activity retains saved invoice origins and practice amounts across navigation" do
    expected = {}
    [@weight, @behavioral, nil].each_with_index do |site, index|
      encounter = site ? clinical_encounter(site) : nil
      invoice = @practice.invoices.create!(patient: @patient, encounter:, currency: "USD", status: "draft",
        rounding_policy_version: "v1")
      intent = @practice.payment_collection_intents.create!(patient: @patient, invoice:,
        reference: "ci_#{SecureRandom.hex(16)}", request_key: SecureRandom.uuid, processor: "stripe", mode: "test",
        currency: "USD", amount: "10.00", state: index == 1 ? "needs_reconciliation" : "pending")
      expected[intent.id] = [site&.id, site&.name || "Shared / unassigned", encounter&.id]
    end
    reports = reports_across_navigation("payment_collection_activity")
    reports.each do |report|
      rows = report.fetch("in_flight_records") + report.fetch("reconciliation_records")
      assert_equal expected.keys.sort, rows.pluck("id").sort
      rows.each { |row| assert_equal expected.fetch(row.fetch("id")), row.values_at("source_site_id", "source_site_name", "encounter_id") }
      assert_equal 3, report.fetch("total")
      assert_equal ["20.0", "10.0"], report.fetch("requested_amounts").sole.fetch("states").values_at("pending", "needs_reconciliation")
    end
    assert_denied("payment_collection_activity", "billing.read")
  end

  test "scribe recovery retains saved session or bound encounter origins without source text" do
    expected = {}
    [@weight, @behavioral, nil].each_with_index do |site, index|
      clinical = index == 1 ? clinical_encounter(site) : nil
      session = @practice.scribe_encounters.create!(patient: @patient, created_by: @actor,
        site: index == 1 ? nil : site, clinical_encounter: clinical, template_id: "soap", template_version: 1)
      source = session.sources.create!(practice: @practice, imported_by: @actor, source_type: "transcript",
        status: "incomplete", content: MARKER, content_digest: Digest::SHA256.hexdigest(MARKER))
      expected[source.id] = [site&.id, site&.name || "Shared / unassigned", clinical&.id]
    end
    session = @practice.scribe_encounters.where(site: @weight).sole
    recording = Clinic::Scribe::Recording.create!(practice: @practice, encounter: session, created_by: @actor,
      status: "interrupted", mime_type: "audio/webm", idempotency_key: SecureRandom.uuid,
      request_digest: Digest::SHA256.hexdigest(MARKER), consent_policy_version: Clinic::Scribe::Workflow::CONSENT_POLICY_VERSION,
      consented_at: Time.current, expected_encounter_version: session.lock_version)
    reports_across_navigation("scribe_activity").each do |report|
      rows = report.fetch("recovery_items")
      rows.select { |row| row.fetch("record_type") == "source" }.each do |row|
        assert_equal expected.fetch(row.fetch("id")), row.values_at("source_site_id", "source_site_name", "clinical_encounter_id")
      end
      assert_equal [@weight.id, @weight.name], rows.find { |row| row.values_at("record_type", "id") == ["recording", recording.id] }
        .values_at("source_site_id", "source_site_name")
      assert_equal 4, report.dig("recovery_pagination", "total")
      assert_equal 3, report.dig("source_counts", "incomplete")
      assert_not_includes report.to_json, MARKER
    end
    assert_denied("scribe_activity", "scribe.read")
  end

  test "stock report and complete CSV retain batch locations and shared office quantities" do
    product = @practice.pharmacy_products.create!(name: "Report stock", sku: "REPORT-STOCK", stock_unit: "each",
      quantity_scale: 0, package_size: 1, unit_reference: "Synthetic catalog")
    expected = {}
    [@weight, @behavioral, nil].each_with_index do |site, index|
      location = @practice.inventory_locations.create!(name: "Shelf, #{index}", site:, kind: "storage")
      receipt = Clinic::Inventory::Receiving.call(practice: @practice, actor: @actor, reason: MARKER, request_key: SecureRandom.uuid,
        lines: [{ product_id: product.id, lot_number: "REPORT-#{index}", location_id: location.id,
          expires_on: "2099-01-01", amount: (index + 1).to_s, input_unit: "each" }])
      entry = Clinic::Inventory::Entry.find_by!(receipt_line_id: receipt.lines.sole.id)
      expected[entry.id] = [location.id, location.name, site&.id, site&.name || "Shared / unassigned"]
    end
    office = @practice.items.create!(name: "Shared office stock", sku: "REPORT-OFFICE", quantity: 0, reorder_level: 0)
    office.adjust!(delta: 4, reason: MARKER, actor: @actor, request_key: SecureRandom.uuid)
    entry = office.entries.sole
    expected[entry.id] = [nil, nil, nil, "Shared / unassigned"]
    reports_across_navigation("daily_stock_movements", date: Date.current.iso8601).each do |report|
      assert_equal 4, report.dig("pagination", "total")
      report.fetch("records").each do |row|
        assert_equal expected.fetch(row.fetch("id")), row.values_at("location_id", "location_name", "source_site_id", "source_site_name")
      end
      assert_equal ["4.0", "6.0"], report.fetch("movements").pluck("signed_quantity").sort
      assert_not_includes report.to_json, MARKER
    end
    filters = { "date" => Date.current.iso8601 }
    snapshot = Clinic::Reports::ExportSource.capture(practice: @practice, actor: @actor, report_id: "daily_stock_movements", filters:)
    csv = Clinic::Reports::ExportCsv.call(report_id: "daily_stock_movements", snapshot:, filters:, actor_id: @actor.id,
      request_key: SecureRandom.uuid, issued_at: Time.current, source_digest: Digest::SHA256.hexdigest(snapshot.to_json),
      serializer_revision: Clinic::Reports::IssueExport::SERIALIZER_REVISION)
    rows = CSV.parse(csv)
    columns = %w[id stock_type item_id batch_id location_id location_name source_site_id source_site_name kind stock_unit signed_quantity occurred_at]
    header = rows.index(columns)
    assert header
    rows.slice(header + 1, 4).each do |values|
      row = columns.zip(values).to_h
      assert_equal expected.fetch(row.fetch("id").to_i).map(&:to_s), row.values_at("location_id", "location_name", "source_site_id", "source_site_name")
    end
    assert_includes rows, ["serializer_revision", "4"]
    assert_not_includes csv, MARKER
    assert_denied("daily_stock_movements", "inventory.read", date: Date.current.iso8601)
  end

  private

  def configured_site(code, name, specialty)
    site = @practice.sites.create!(code:, name:, status: "active")
    Clinic::Configuration::PracticeFeatures.revise(practice: @practice, actor: @membership, site:,
      request_key: "report-profile-#{code}", expected_revision: 0, insurance_workflows_enabled: false,
      clinic_type: specialty, service_scope: [], assessment_scope: [], finalize: true)
    site
  end

  def clinical_encounter(site)
    @practice.encounters.create!(patient: @patient, site:, started_at: 2.hours.ago, ended_at: 1.hour.ago, status: "completed")
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def reports_across_navigation(name, **params)
    reports = [@weight, @behavioral].map do |site|
      patch "/api/clinic/context", params: { site_id: site.id }, headers: csrf_headers, as: :json
      assert_response :success
      get "/api/clinic/reports/#{name}", params:, headers: @headers
      assert_response :success
      response.parsed_body.fetch("report").except("as_of")
    end
    assert_equal reports.first, reports.last
    reports
  end

  def assert_denied(name, permission, **params)
    set_permission!(@membership, permission, false)
    get "/api/clinic/reports/#{name}", params:, headers: @headers
    assert_response :forbidden
    assert_not response.parsed_body.key?("report")
  end
end

class DurableOperationalReportExportTest < ActionDispatch::IntegrationTest
  # Issuance owns a top-level repeatable-read transaction; synthetic records
  # remain in the separately owned test database rather than bypassing that gate.
  self.use_transactional_tests = false

  test "durable report issuance retry download and revoked access preserve saved private-free bytes" do
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    password = SecureRandom.hex(20)
    token = SecureRandom.hex(8)
    actor = User.create!(email_address: "durable-report-#{token}@example.invalid", password:)
    practice = Clinic::Practice.create!(name: "Durable report #{token}", timezone: "UTC")
    membership = practice.memberships.create!(user: actor)
    grant_permissions!(membership, "appointments.read", "facilities.read", "facilities.write")
    patient = practice.patients.create!(display_name: "Private export sentinel patient", reference: "DURABLE-#{token}")
    weight = practice.sites.create!(code: "W", name: "Weight clinic", status: "active")
    behavioral = practice.sites.create!(code: "B", name: "Behavioral clinic", status: "active")
    [[weight, "weight_loss"], [behavioral, "behavioral_health"]].each do |site, specialty|
      Clinic::Configuration::PracticeFeatures.revise(practice:, actor: membership, site:,
        request_key: "durable-profile-#{site.code}", expected_revision: 0, insurance_workflows_enabled: false,
        clinic_type: specialty, service_scope: specialty == "behavioral_health" ? ["individual_therapy"] : [],
        assessment_scope: [], finalize: true)
    end
    starts_at = Date.current.in_time_zone("UTC").change(hour: 10)
    weight_appointment = practice.appointments.create!(patient:, site: weight, starts_at:, ends_at: starts_at + 30.minutes,
      status: "confirmed", visit_modality: "in_person")
    visit_id = Clinic::Configuration::PracticeFeatures.snapshot(practice:, site: behavioral)
      .dig(:starter_profile, "visits", "individual_therapy", "visit_type_id")
    appointment = practice.appointments.create!(patient:, site: behavioral, visit_type_id: visit_id,
      starts_at:, ends_at: starts_at + 1.hour, status: "confirmed", visit_modality: "in_person")
    encounter = practice.encounters.create!(patient:, site: behavioral, appointment:, started_at: starts_at, status: "open")
    marker = "PRIVATE-PSYCHOTHERAPY-EXPORT-SENTINEL-#{token}"
    private_note = Clinic::Care::PsychotherapyNote.create!(practice:, patient:, encounter:,
      originator_membership: membership, version_number: 1, body: marker, recorded_at: Time.current,
      request_key: "durable-private-#{token}")
    assert_equal marker, private_note.reload.body
    post "/api/session", params: { email_address: actor.email_address, password: }, headers: durable_csrf_headers, as: :json
    assert_response :success
    request = { export: { report_id: "daily_visits_by_state", filters: { date: starts_at.to_date.iso8601, site_id: behavioral.id },
      scope: "all_filtered_rows", request_key: "durable-export-#{token}" } }
    assert_difference("Clinic::ReportExport.where(practice_id: #{practice.id}).count", 1) do
      post "/api/clinic/report_exports", params: request, headers: durable_csrf_headers, as: :json
      assert_response :created
    end
    receipt = response.parsed_body.fetch("export")
    assert_equal false, response.parsed_body.fetch("recovered")
    assert_equal [practice.id, behavioral.id, actor.id, 4], receipt.values_at("practice_id", "site_id", "issued_by_user_id", "serializer_revision")
    assert_equal({ "matched" => 1, "exported" => 1 }, receipt.dig("row_counts", "records"))
    get "/api/clinic/report_exports/#{receipt.fetch('id')}", headers: @headers
    assert_response :success
    saved_snapshot = response.parsed_body.fetch("source_snapshot")
    assert_equal "repeatable_read", saved_snapshot.fetch("consistency")
    assert_equal [appointment.id], saved_snapshot.fetch("records").pluck("id")
    assert_not_includes response.body, marker
    assert_not_includes response.body, patient.display_name

    get receipt.fetch("download_url"), headers: @headers
    assert_response :success
    assert_equal "application/json", response.media_type
    csv = response.parsed_body.fetch("artifact_csv")
    assert_equal receipt, response.parsed_body.fetch("export")
    assert_equal receipt.fetch("artifact_digest"), Digest::SHA256.hexdigest(csv)
    assert_equal receipt.fetch("artifact_bytes"), csv.bytesize
    rows = CSV.parse(csv)
    columns = %w[id site_id status visit_modality local_start]
    header = rows.index(columns)
    assert header
    assert_equal [appointment.id.to_s, behavioral.id.to_s, "confirmed", "in_person", "10:00"], rows.fetch(header + 1)
    assert_nil rows[header + 2]
    assert_not_includes csv, marker
    assert_not_equal weight_appointment.id.to_s, rows.fetch(header + 1).first

    appointment.transition_to!("completed")
    patch "/api/clinic/context", params: { site_id: weight.id }, headers: durable_csrf_headers, as: :json
    assert_response :success
    assert_no_difference("Clinic::ReportExport.where(practice_id: #{practice.id}).count") do
      post "/api/clinic/report_exports", params: request, headers: durable_csrf_headers, as: :json
      assert_response :success
      assert_equal true, response.parsed_body.fetch("recovered")
      assert_equal receipt, response.parsed_body.fetch("export")
    end
    get receipt.fetch("download_url"), headers: @headers
    assert_response :success
    assert_equal csv, response.parsed_body.fetch("artifact_csv")
    get "/api/clinic/report_exports/#{receipt.fetch('id')}", headers: @headers
    assert_response :success
    assert_equal saved_snapshot, response.parsed_body.fetch("source_snapshot")
    post "/api/clinic/report_exports", params: request.deep_merge(export: { filters: { site_id: weight.id } }),
      headers: durable_csrf_headers, as: :json
    assert_response :conflict

    other = User.create!(email_address: "durable-report-other-#{token}@example.invalid", password:)
    other_membership = practice.memberships.create!(user: other)
    grant_permissions!(other_membership, "appointments.read")
    post "/api/session", params: { email_address: other.email_address, password: }, headers: durable_csrf_headers, as: :json
    assert_response :success
    get receipt.fetch("download_url"), headers: @headers
    assert_response :not_found
    assert_not response.parsed_body.key?("artifact_csv")
    post "/api/session", params: { email_address: actor.email_address, password: }, headers: durable_csrf_headers, as: :json
    assert_response :success
    set_permission!(membership, "appointments.read", false)
    get receipt.fetch("download_url"), headers: @headers
    assert_response :forbidden
    assert_not response.parsed_body.key?("artifact_csv")
    post "/api/clinic/report_exports", params: request, headers: durable_csrf_headers, as: :json
    assert_response :forbidden
    assert_not response.parsed_body.key?("export")
    assert_equal 1, Clinic::ReportExport.where(practice:).count
    assert_equal csv, Clinic::ReportExport.find(receipt.fetch("id")).artifact_csv
  end

  private

  def durable_csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
