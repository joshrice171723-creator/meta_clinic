require "test_helper"
require "csv"

class WorkforcePayrollTest < ActiveSupport::TestCase
  setup do
    @practice = Clinic::Practice.create!(name: "Workforce Payroll Clinic", timezone: "UTC")
    @actor = User.create!(email_address: "payroll-#{SecureRandom.hex(6)}@example.com", password: "Payroll-password-123!")
    @member = Clinic::Membership.create!(practice: @practice, user: @actor)
    grant_permissions!(@member, "workforce.payroll.export", "workforce.payroll.configure")
    @site = Clinic::Site.create!(practice: @practice, code: "MAIN", name: "Main clinic", status: "active")
    staff = Clinic::Staff::Member.create!(practice: @practice, display_name: "Taylor Morgan", job_title: "Coordinator")
    @employment = Clinic::Workforce::Employment.create!(practice: @practice, staff_member: staff, membership: @member, effective_from: 1.year.ago)
    Clinic::Workforce::EmploymentSite.create!(practice: @practice, employment: @employment, site: @site, effective_from: 1.year.ago)
    values = Clinic::Workforce::SettingsVersion::BOOLEAN_KEYS.to_h { |key| [key, false] }
      .merge(Clinic::Workforce::SettingsVersion::NULLABLE_INTEGER_KEYS.to_h { |key| [key, nil] })
      .merge(Clinic::Workforce::SettingsVersion::ENUMS.to_h { |key, enums| [key, enums.first] })
      .merge("timezone" => "UTC", "workweek_start_day" => 1, "workweek_start_time" => "00:00", "break_paid" => false,
        "provider_mapping" => {}, "payroll_export_enabled" => true)
    Clinic::Workforce::SettingsVersion.create!(practice: @practice, scope_kind: "practice", revision: 1,
      effective_from: 1.year.ago, created_by_membership: @member, values: values)
    @configuration = Clinic::Workforce::PayrollConfigurationVersion.create!(practice: @practice, site: @site,
      created_by_membership: @member, name: "Payroll hours", revision: 1, effective_from: 1.day.ago,
      columns: Clinic::Workforce::GeneratePayrollExport::DEFAULT_COLUMNS, employee_identifiers: { @employment.id.to_s => "=PAY001" })
    @period = Date.new(2026, 8, 31)
    @card = Clinic::Workforce::TimecardVersion.create!(practice: @practice, employment: @employment,
      period_start: @period, period_end: @period + 7, version_number: 1,
      source_digest: Clinic::Workforce::CalculateTimecard.current_source_digest(employment: @employment, period_start: @period),
      status: "approved", submitted_at: Time.current, submitted_by_membership: @member,
      approved_at: Time.current, approved_by_membership: @member, snapshot: {
        "segments" => [{ "site_id" => @site.id.to_s, "local_date" => @period.to_s, "regular_minutes" => 480,
          "overtime_minutes" => 60, "paid_minutes" => 540, "exception_codes" => [] }]
      })
    @key = SecureRandom.uuid
  end

  test "preview does not write and confirmed export stores immutable formula-safe CSV" do
    assert_no_difference("Clinic::Workforce::ExportBatch.count") do
      result = export(preview: true)
      assert_equal "9.0", result[:totals]["paid_hours"]
    end
    batch = export
    rows = CSV.parse(batch.csv_content)
    assert_equal "'=PAY001", rows[1][0]
    assert_equal "8.0", rows[1][3]
    assert_equal "1.0", rows[1][4]
    assert_not_includes batch.read_attribute_before_type_cast(:csv_content), "PAY001"
    assert_raises(ActiveRecord::StatementInvalid) do
      Clinic::Workforce::ExportBatch.transaction(requires_new: true) { batch.update_columns(csv_content: "changed") }
    end
  end

  test "retry returns the existing batch and conflicting reuse is rejected" do
    batch = export
    assert_no_difference("Clinic::Workforce::ExportBatch.count") { assert_equal batch.id, export.id }
    assert_raises(ArgumentError) { export(supersedes_batch_id: batch.id) }
    @key = SecureRandom.uuid
    assert_raises(ArgumentError) { export }
    replacement = export(supersedes_batch_id: batch.id)
    assert_equal batch.id, replacement.supersedes_batch_id
  end

  test "draft and stale approved versions cannot be exported" do
    @card = Clinic::Workforce::TimecardVersion.create!(practice: @practice, employment: @employment,
      period_start: @period, period_end: @period + 7, version_number: 2, source_digest: "b" * 64)
    assert_raises(ArgumentError) { export }
    @card = Clinic::Workforce::TimecardVersion.find_by!(employment: @employment, version_number: 1)
    assert_raises(ArgumentError) { export }
  end

  test "source changes after approval prevent export" do
    Clinic::Workforce::Punch.create!(practice: @practice, employment: @employment, site: @site,
      event_type: "clock_in", source: "manager_correction", request_key: SecureRandom.uuid,
      correlation_id: SecureRandom.uuid, payload_digest: "a" * 64, time_zone: "UTC", utc_offset_seconds: 0,
      local_date: @period, occurred_at_utc: @period.to_time + 8.hours, received_at: Time.current)
    assert_raises(ArgumentError) { export }
  end

  test "export authority is rechecked" do
    revoke_all_permissions!(@member)
    assert_raises(Clinic::Authorization::Denied) { export }
  end

  test "mapping rejects unsupported and duplicate fields and identifiers" do
    service = Clinic::Workforce::GeneratePayrollExport
    assert_raises(ArgumentError) { service.validate_mapping!([{ "field" => "password", "header" => "Password" }], {}) }
    assert_raises(ArgumentError) { service.validate_mapping!(service::DEFAULT_COLUMNS, { "1" => "E1", "2" => "E1" }) }
  end

  private

  def export(**options)
    Clinic::Workforce::GeneratePayrollExport.call(practice: @practice, actor: @actor, configuration: @configuration,
      timecard_ids: [@card.id], request_key: @key, **options)
  end
end
