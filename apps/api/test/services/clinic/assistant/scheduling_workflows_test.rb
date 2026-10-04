require "test_helper"

class SchedulingWorkflowsTest < ActiveSupport::TestCase
  setup do
    travel_to Time.utc(2026, 10, 4, 8)
    organization = Organization.create!(name: "Assistant scheduling proof")
    @practice = Clinic::Practice.create!(organization:, name: "Scheduling proof", timezone: "UTC")
    @actor = User.create!(email_address: "assistant-schedule-#{SecureRandom.hex(6)}@example.invalid", password: SecureRandom.hex(18))
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "appointments.read", "appointments.book", "appointments.status_transition",
      "patients.identity.read", "facilities.write", "encounters.write")
    @site = @practice.sites.create!(code: "ASSISTANT-SCHEDULE", status: "active")
    @clinician = @practice.clinician_profiles.create!(membership: @membership, display_name: "Scheduling Clinician")
    @visit_type = @practice.visit_types.create!(code: "ASSISTANT-SCHEDULE-VISIT")
    configure_site!(@site, membership: @membership)
    @patient = @practice.patients.create!(display_name: "Scheduling Patient", reference: "ASSISTANT-SCHEDULE-001")
    7.times do |weekday|
      Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
        kind: "weekly", weekday:, start_minute: 480, end_minute: 1020, active: true)
    end
    @appointment = @practice.appointments.create!(patient: @patient, site: @site, booked_clinician: @clinician,
      visit_type: @visit_type, starts_at: Time.utc(2026, 10, 5, 9), ends_at: Time.utc(2026, 10, 5, 9, 30),
      status: "scheduled", visit_modality: "in_person")
    @handler = handler(patient: @patient)
  end

  teardown { travel_back }

  test "appointment reads retain patient and location scope and return saved values" do
    other_patient = @practice.patients.create!(display_name: "Other Patient", reference: "ASSISTANT-SCHEDULE-002")
    other = @practice.appointments.create!(patient: other_patient, site: @site, booked_clinician: @clinician,
      visit_type: @visit_type, starts_at: Time.utc(2026, 10, 5, 11), ends_at: Time.utc(2026, 10, 5, 11, 30),
      status: "scheduled", visit_modality: "in_person")
    result = run_operation("scheduling.appointments", "date" => "2026-10-05")
    rows = result.fetch(:sections).last.fetch(:rows)
    assert_equal [@patient.display_name], rows.pluck("patient")
    assert_equal "scheduled", rows.sole.fetch("status")
    assert_raises(ActiveRecord::RecordNotFound) do
      @handler.resolve(key: "scheduling.appointment", inputs: { "appointment" => reference(other) })
    end
  end

  test "reschedule persists the exact proposed interval through existing scheduler" do
    result = run_operation("scheduling.reschedule", "appointment" => reference(@appointment),
      "starts_at" => "2026-10-05T10:00:00Z", "ends_at" => "2026-10-05T10:30:00Z")
    assert_equal Time.utc(2026, 10, 5, 10), @appointment.reload.starts_at
    assert_equal Time.utc(2026, 10, 5, 10, 30), @appointment.ends_at
    assert_equal @appointment.status, result.fetch(:sections).sole.fetch(:rows).sole.fetch("status")
    assert_equal 1, @practice.appointments.count
  end

  test "cancellation requires explicit acknowledgment and persists once through domain transition" do
    input = { "appointment" => reference(@appointment), "status" => "cancelled" }
    assert_raises(ArgumentError) { @handler.resolve(key: "scheduling.status", inputs: input) }
    assert_equal "scheduled", @appointment.reload.status
    run_operation("scheduling.status", input.merge("cancellation_acknowledged" => true))
    assert_equal "cancelled", @appointment.reload.status
  end

  test "a record changed since named choices were issued is rejected" do
    input = { "appointment" => reference(@appointment) }
    @appointment.update!(status: "confirmed")
    assert_raises(Clinic::Assistant::WorkflowExecution::Conflict) do
      @handler.resolve(key: "scheduling.appointment", inputs: input)
    end
  end

  test "waitlist and blocked time use shared persisted operations" do
    result = run_operation("scheduling.waitlist_add", "clinician" => reference(@clinician),
      "visit_type" => reference(@visit_type), "earliest_at" => "2026-10-06T09:00:00Z",
      "latest_at" => "2026-10-06T12:00:00Z", "duration_minutes" => 30, "reason" => "Requested morning visit")
    entry = Clinic::Scheduling::WaitlistEntry.where(practice: @practice).sole
    assert_equal [@patient.id, @site.id, @clinician.id, 30], [entry.patient_id, entry.site_id, entry.clinician_id, entry.duration_minutes]
    assert_equal "waiting", result.fetch(:sections).sole.fetch(:rows).sole.fetch("state")
    run_operation("scheduling.block", "clinician" => reference(@clinician),
      "starts_at" => "2026-10-07T12:00:00Z", "ends_at" => "2026-10-07T13:00:00Z", "reason" => "Clinic meeting")
    block = Clinic::Scheduling::CapacityRule.where(practice: @practice, kind: "block").sole
    assert_equal Time.utc(2026, 10, 7, 12), block.starts_at
    assert_equal "Clinic meeting", block.reason
    assert_equal "scheduled", @appointment.reload.status
  end

  private

  def handler(patient:)
    Clinic::Assistant::Workflows::Scheduling.new(practice: @practice, actor: @actor, site: @site, patient:, encounter: nil)
  end

  def reference(record)
    { "record_type" => record.class.name, "record_id" => record.id,
      "label" => "Named clinic selection", "version" => Clinic::Assistant::ContextRegistry.record_version(record) }
  end

  def run_operation(key, inputs)
    resolved = @handler.resolve(key:, inputs:)
    resolved["_request_key"] = "assistant-proof-#{SecureRandom.uuid}"
    @handler.execute(key:, resolved:)
  end
end
