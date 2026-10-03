require "test_helper"
require "csv"

class FinancialSiteAttributionTest < ActionDispatch::IntegrationTest
  setup do
    travel_to Time.utc(2026, 10, 3, 12)
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(20)
    @actor = User.create!(email_address: "financial-location@example.invalid", password: @password)
    @practice = Clinic::Practice.create!(name: "Financial location clinic", timezone: "UTC")
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "patients.read", "billing.read", "facilities.read", "facilities.write")
    @patient = @practice.patients.create!(display_name: "Shared billing patient", reference: "FINANCIAL-LOCATION")
    @weight = configured_site("W", "Weight, Clinic", "weight_loss")
    @behavioral = configured_site("B", "Behavioral Health", "behavioral_health")
    @weight_invoice = posted_invoice(@weight, "100.00")
    @behavioral_invoice = posted_invoice(@behavioral, "200.00")
    @shared_invoice = posted_invoice(nil, "25.00")
    @payment = Clinic::PaymentEvent.create!(practice: @practice, patient: @patient, currency: "USD", amount: "150.00",
      external_event_reference: "location-payment")
    [[@weight_invoice, "40.00"], [@behavioral_invoice, "60.00"], [@shared_invoice, "10.00"]].each do |invoice, amount|
      @payment.allocations.create!(practice: @practice, patient: @patient, invoice: invoice, amount: amount)
    end
    @refund = @payment.refund_events.create!(practice: @practice, patient: @patient, currency: "USD",
      amount: "15.00", reason: "Patient requested a refund")
    @unallocated = Clinic::PaymentEvent.create!(practice: @practice, patient: @patient, currency: "USD", amount: "20.00",
      external_event_reference: "location-unallocated-payment")
    post "/api/session", params: { email_address: @actor.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  teardown { travel_back }

  test "invoice ledger dashboard and daily reports retain saved origins and all money across navigation sites" do
    projections = [@weight, @behavioral].map do |navigation_site|
      patch "/api/clinic/context", params: { site_id: navigation_site.id }, headers: csrf_headers, as: :json
      assert_response :success
      details = invoice_ids.map do |id|
        get "/api/clinic/invoices/#{id}", headers: @headers
        assert_response :success
        response.parsed_body.fetch("invoice")
      end
      assert_invoice_origins(details)
      get "/api/clinic/patients/#{@patient.id}/billing_ledger", headers: @headers
      assert_response :success
      ledger = response.parsed_body
      assert_invoice_origins(ledger.fetch("invoices"))
      assert_equal ["325.0", "110.0", "215.0", "15.0"], ledger.fetch("currencies").sole
        .values_at("invoiced_amount", "allocated_amount", "balance_amount", "refunded_amount")
      payments = ledger.fetch("payments").index_by { |row| row.fetch("id") }
      assert_equal source_sites, payments.fetch(@payment.id).fetch("source_sites")
      assert_equal ["150.0", "110.0", "25.0"], payments.fetch(@payment.id).values_at("amount", "allocated_amount", "unapplied_amount")
      assert_equal @refund.id, payments.fetch(@payment.id).fetch("refunds").sole.fetch("id")
      assert_equal [{ "id" => nil, "name" => "Shared / unassigned" }], payments.fetch(@unallocated.id).fetch("source_sites")
      assert_equal "20.0", payments.fetch(@unallocated.id).fetch("unapplied_amount")

      get "/api/clinic/billing", headers: @headers
      assert_response :success
      dashboard = response.parsed_body
      assert_invoice_origins(dashboard.fetch("recent_invoices"))
      assert_equal 3, dashboard.dig("metrics", "invoice_count")
      assert_equal ["325.0", "110.0", "170.0", "15.0", "155.0", "215.0"], dashboard.dig("metrics", "currencies").sole
        .values_at("monthly_invoiced", "monthly_collected", "monthly_received", "monthly_refunded", "monthly_net_collected", "outstanding")

      get "/api/clinic/reports/daily_invoices", params: { date: Date.current.iso8601 }, headers: @headers
      assert_response :success
      invoices = response.parsed_body.fetch("report")
      assert_invoice_origins(invoices.fetch("records"))
      assert_equal ["325.0", "215.0"], invoices.fetch("currencies").sole.values_at("posted_line_total", "current_outstanding_balance")
      get "/api/clinic/reports/daily_payment_activity", params: { date: Date.current.iso8601 }, headers: @headers
      assert_response :success
      activity = response.parsed_body.fetch("report")
      assert_equal [2, "170.0", 1, "15.0"], activity.fetch("currencies").sole.values_at("payment_count", "payment_amount", "refund_count", "refund_amount")
      assert_equal source_sites, activity.fetch("payment_records").find { |row| row.fetch("id") == @payment.id }.fetch("source_sites")
      assert_equal source_sites, activity.fetch("refund_records").sole.fetch("source_sites")
      assert_equal [{ "id" => nil, "name" => "Shared / unassigned" }],
        activity.fetch("payment_records").find { |row| row.fetch("id") == @unallocated.id }.fetch("source_sites")
      [ledger, dashboard.fetch("metrics"), invoices.fetch("records"), invoices.fetch("currencies"),
        activity.fetch("payment_records"), activity.fetch("refund_records"), activity.fetch("currencies")]
    end
    assert_equal projections.first, projections.last
  end

  test "complete CSV projections retain invoice allocation refund and shared origins without changing totals" do
    filters = { "date" => Date.current.iso8601 }
    invoices = Clinic::Reports::ExportSource.capture(practice: @practice, actor: @actor, report_id: "daily_invoices", filters: filters)
    activity = Clinic::Reports::ExportSource.capture(practice: @practice, actor: @actor, report_id: "daily_payment_activity", filters: filters)
    assert_equal 3, invoices.dig("row_counts", "records", "matched")
    assert_equal 2, activity.dig("row_counts", "payment_records", "matched")
    assert_equal 1, activity.dig("row_counts", "refund_records", "matched")
    invoice_columns = %w[id patient_id encounter_id source_site_id source_site_name currency status created_at current_outstanding_balance]
    rows = csv_section(csv_for("daily_invoices", invoices, filters), invoice_columns, 3).index_by { |row| row.fetch("id").to_i }
    assert_equal [@weight.id.to_s, @weight.name, "60.0"], rows.fetch(@weight_invoice.id).values_at("source_site_id", "source_site_name", "current_outstanding_balance")
    assert_equal [@behavioral.id.to_s, @behavioral.name, "140.0"], rows.fetch(@behavioral_invoice.id).values_at("source_site_id", "source_site_name", "current_outstanding_balance")
    assert_equal ["", "Shared / unassigned", "15.0"], rows.fetch(@shared_invoice.id).values_at("source_site_id", "source_site_name", "current_outstanding_balance")
    payment_csv = csv_for("daily_payment_activity", activity, filters)
    payment_rows = csv_section(payment_csv, %w[id patient_id source_sites currency amount created_at], 2).index_by { |row| row.fetch("id").to_i }
    assert_equal source_sites, JSON.parse(payment_rows.fetch(@payment.id).fetch("source_sites"))
    assert_equal [{ "id" => nil, "name" => "Shared / unassigned" }], JSON.parse(payment_rows.fetch(@unallocated.id).fetch("source_sites"))
    refund = csv_section(payment_csv, %w[id payment_event_id patient_id source_sites currency amount created_at], 1).sole
    assert_equal source_sites, JSON.parse(refund.fetch("source_sites"))
    assert_equal [@refund.id.to_s, @payment.id.to_s, "15.0"], refund.values_at("id", "payment_event_id", "amount")
    assert_equal ["325.0", "215.0"], invoices.fetch("currencies").sole.values_at("posted_line_total", "current_outstanding_balance")
    assert_equal ["170.0", "15.0"], activity.fetch("currencies").sole.values_at("payment_amount", "refund_amount")
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def configured_site(code, name, specialty)
    site = @practice.sites.create!(code: code, name: name, status: "active")
    Clinic::Configuration::PracticeFeatures.revise(practice: @practice, actor: @membership, site: site,
      request_key: "financial-profile-#{code}", expected_revision: 0, insurance_workflows_enabled: false,
      clinic_type: specialty, service_scope: [], assessment_scope: [], finalize: true)
    site
  end

  def posted_invoice(site, amount)
    encounter = if site
      @practice.encounters.create!(patient: @patient, site: site, started_at: 2.hours.ago, ended_at: 1.hour.ago, status: "completed")
    end
    invoice = @practice.invoices.create!(patient: @patient, encounter: encounter, currency: "USD", status: "draft", rounding_policy_version: "v1")
    invoice.lines.create!(practice: @practice, patient: @patient, quantity: "1", unit_amount: amount,
      posted_amount: amount, description_snapshot: "Visit charge")
    invoice.transition_to!("posted")
    invoice
  end

  def invoice_ids = [@weight_invoice.id, @behavioral_invoice.id, @shared_invoice.id]

  def assert_invoice_origins(records)
    rows = records.index_by { |row| row.fetch("id") }
    assert_equal invoice_ids.sort, rows.keys.sort
    assert_equal [@weight.id, @weight.name], rows.fetch(@weight_invoice.id).values_at("source_site_id", "source_site_name")
    assert_equal [@behavioral.id, @behavioral.name], rows.fetch(@behavioral_invoice.id).values_at("source_site_id", "source_site_name")
    assert_equal [nil, "Shared / unassigned"], rows.fetch(@shared_invoice.id).values_at("source_site_id", "source_site_name")
  end

  def source_sites
    [{ "id" => nil, "name" => "Shared / unassigned" }, { "id" => @weight.id, "name" => @weight.name },
      { "id" => @behavioral.id, "name" => @behavioral.name }].sort_by { |row| [row["id"].nil? ? 0 : 1, row["id"].to_i] }
  end

  def csv_for(report_id, snapshot, filters)
    Clinic::Reports::ExportCsv.call(report_id: report_id, snapshot: snapshot, filters: filters,
      actor_id: @actor.id, request_key: "financial-csv-#{report_id}", issued_at: Time.current,
      source_digest: Digest::SHA256.hexdigest(snapshot.to_json), serializer_revision: Clinic::Reports::IssueExport::SERIALIZER_REVISION)
  end

  def csv_section(csv, columns, count)
    rows = CSV.parse(csv)
    header = rows.index(columns)
    assert header, "Expected CSV columns #{columns.inspect}"
    rows.slice(header + 1, count).map { |row| columns.zip(row).to_h }
  end
end
