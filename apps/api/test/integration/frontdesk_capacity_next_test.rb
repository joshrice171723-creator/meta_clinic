require "test_helper"

# Independently synthetic fixtures; exercise real Rails reads and authorization.
class FrontdeskCapacityNextTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "queue-capacity-next@example.invalid", password: @password)
    @practice = Clinic::Practice.create!(name: "Synthetic Queue Capacity",
      organization: Organization.create!(name: "Synthetic Queue Capacity"), timezone: "UTC")
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "appointments.read", "billing.read")
    @site = @practice.sites.create!(code: "NEXT", status: "active")
    @other_site = @practice.sites.create!(code: "OTHER", status: "active")
    grant_permissions!(@membership, "notes.read", scope_kind: "site", site: @site)
    @clinician = @practice.clinician_profiles.create!(membership: @membership, display_name: "Synthetic Next Clinician")
    @patient = @practice.patients.create!(display_name: "Synthetic Next Patient", reference: "NEXT-ONE")
    @other_patient = @practice.patients.create!(display_name: "Synthetic Other Patient", reference: "NEXT-TWO")
    @type = @practice.visit_types.create!(code: "Synthetic next visit")
    @date = Date.current.next_month.beginning_of_month
    @start = Time.utc(@date.year, @date.month, @date.day, 9)
    Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
      kind: "weekly", weekday: @date.wday, start_minute: 540, end_minute: 840, active: true)
    @first = appointment(@patient, @site, @start, @start + 30.minutes, status: "cancelled")
    @second = appointment(@other_patient, @other_site, @start + 1.hour, @start + 90.minutes, status: "cancelled")
    @answer_marker = "SYNTHETIC-NEXT-ANSWER-NOT-FOR-QUEUE"
    encoded = Clinic::Care::PrevisitIntake.encode(text: @answer_marker,
      answers: { "visit_reason" => { "state" => "answered", "value" => @answer_marker } },
      attested: false, status: "draft")
    @first.previsit_notes.create!(practice: @practice, patient: @patient, submitted_by_user: @user,
      submitted_at: Time.current, version_number: 1, request_key: "next-queue-note", encrypted_text: encoded)
    invoice = @practice.invoices.create!(patient: @patient, currency: "USD", status: "draft", rounding_policy_version: "test-v1")
    invoice.lines.create!(practice: @practice, patient: @patient, quantity: 1,
      unit_amount: "37.25", posted_amount: "37.25", description_snapshot: "Synthetic next invoice line")
    invoice.update!(status: "posted")
    @entry = waitlist(@practice, @patient, @site, @clinician, @type)
    login
  end

  test "authorized queue reads return page bounded metadata without answer or invoice detail" do
    get_queue(page: 1, per_page: 1)
    assert_response :success
    assert_equal [@first.id], response.parsed_body.fetch("appointments").map { |row| row.fetch("id") }
    assert_equal({ "page" => 1, "per_page" => 1, "total" => 2, "total_pages" => 2 }, response.parsed_body.fetch("pagination"))
    context = response.parsed_body.fetch("appointments").sole.fetch("queue_context")
    assert_equal "draft", context.dig("previsit_intake", "status")
    assert_equal 1, context.dig("previsit_intake", "answered_count")
    assert_operator context.dig("previsit_intake", "question_count"), :>, 1
    assert_equal "not_started", context.dig("encounter_intake", "status")
    assert_equal "available", context.dig("balance_due", "status")
    assert_equal [{ "currency" => "USD", "balance_amount" => "37.25" }], context.dig("balance_due", "currencies")
    assert_not_includes response.body, @answer_marker
    assert_not_includes response.body, "Synthetic next invoice line"
    assert_not_includes context.to_json, "encrypted_text"
    get_queue(page: 2, per_page: 1)
    assert_response :success
    assert_equal [@second.id], response.parsed_body.fetch("appointments").map { |row| row.fetch("id") }
    assert_equal "no_posted_invoices", response.parsed_body.fetch("appointments").sole.dig("queue_context", "balance_due", "status")
  end

  test "identity only scheduling account cannot read clinical or financial queue metadata or another site" do
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.identity.read")
    grant_permissions!(@membership, "appointments.read", scope_kind: "site", site: @site)
    get_queue
    assert_response :success
    assert_equal [@first.id], response.parsed_body.fetch("appointments").map { |row| row.fetch("id") }
    context = response.parsed_body.fetch("appointments").sole.fetch("queue_context")
    %w[previsit_intake encounter_intake balance_due].each do |key|
      assert_equal({ "status" => "unavailable" }, context.fetch(key))
    end
    assert_not_includes response.body, @answer_marker
    assert_not_includes response.body, "37.25"
    get_calendar(site_id: @other_site.id)
    assert_response :forbidden
  end

  test "patient and billing permission do not replace site specific note permission" do
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.read", "appointments.read", "billing.read")
    grant_permissions!(@membership, "notes.read", scope_kind: "site", site: @other_site)
    get_queue(site_id: @site.id)
    assert_response :success
    context = response.parsed_body.fetch("appointments").sole.fetch("queue_context")
    assert_equal({ "status" => "unavailable" }, context.fetch("previsit_intake"))
    assert_equal "available", context.dig("balance_due", "status")
    assert_not_includes response.body, @answer_marker
  end

  test "calendar accepts exact duration bounds and rejects invalid or stale entry duration" do
    [5, 240].each do |duration|
      get_calendar(duration_minutes: duration)
      assert_response :success
      assert_equal duration, response.parsed_body.fetch("duration_minutes")
      slots = calendar_day.fetch("slots")
      assert_not_empty slots
      assert slots.all? { |slot| Time.iso8601(slot.fetch("ends_at")) - Time.iso8601(slot.fetch("starts_at")) == duration.minutes }
    end
    [4, 241, "5.5", "invalid"].each do |duration|
      get_calendar(duration_minutes: duration)
      assert_response :bad_request
      assert_equal "duration_minutes", response.parsed_body.fetch("field")
    end
    get_calendar(waitlist_entry_id: @entry.id, duration_minutes: 30)
    assert_response :unprocessable_entity
    get_calendar(waitlist_entry_id: @entry.id, duration_minutes: 45)
    assert_response :success
    assert_equal({ "id" => @entry.id, "version" => @entry.lock_version }, response.parsed_body.fetch("waitlist_entry"))
  end

  test "calendar waitlist lookup rejects wrong site foreign clinic and inaccessible patient" do
    other_entry = waitlist(@practice, @other_patient, @other_site, @clinician, @type)
    get_calendar(waitlist_entry_id: other_entry.id, duration_minutes: 45)
    assert_response :not_found
    foreign = Clinic::Practice.create!(name: "Synthetic Foreign Queue", timezone: "UTC")
    foreign_site = foreign.sites.create!(code: "FOREIGN", status: "active")
    foreign_user = User.create!(email_address: "foreign-next@example.invalid", password: SecureRandom.hex(18))
    foreign_member = foreign.memberships.create!(user: foreign_user)
    foreign_clinician = foreign.clinician_profiles.create!(membership: foreign_member)
    foreign_patient = foreign.patients.create!(display_name: "Synthetic Foreign Patient", reference: "FOREIGN-NEXT")
    foreign_type = foreign.visit_types.create!(code: "Foreign next visit")
    foreign_entry = waitlist(foreign, foreign_patient, foreign_site, foreign_clinician, foreign_type)
    get_calendar(waitlist_entry_id: foreign_entry.id, duration_minutes: 45)
    assert_response :not_found
    get_calendar(site_id: foreign_site.id)
    assert_response :not_found
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "appointments.read", scope_kind: "site", site: @site)
    get_calendar(waitlist_entry_id: @entry.id, duration_minutes: 45)
    assert_response :not_found
  end

  test "full duration suggestion excludes a conflict after the candidate start without reserving anything" do
    appointment(@other_patient, @site, @start + 30.minutes, @start + 1.hour)
    counts = [Clinic::Appointment.count, Clinic::Scheduling::WaitlistEntry.count, Clinic::Scheduling::ScheduleHold.count]
    get_calendar(duration_minutes: 5)
    assert_response :success
    assert calendar_day.fetch("slots").any? { |slot| Time.iso8601(slot.fetch("starts_at")) == @start }
    get_calendar(waitlist_entry_id: @entry.id, duration_minutes: 45)
    assert_response :success
    slots = calendar_day.fetch("slots")
    assert_not_empty slots
    assert slots.none? { |slot| Time.iso8601(slot.fetch("starts_at")) == @start }
    assert slots.any? { |slot| Time.iso8601(slot.fetch("starts_at")) == @start + 1.hour }
    assert slots.all? { |slot| Time.iso8601(slot.fetch("ends_at")) - Time.iso8601(slot.fetch("starts_at")) == 45.minutes }
    assert_equal counts, [Clinic::Appointment.count, Clinic::Scheduling::WaitlistEntry.count, Clinic::Scheduling::ScheduleHold.count]
    assert_equal "waiting", @entry.reload.state
    assert_nil @entry.offer_starts_at
    assert_equal 0, @entry.lock_version
  end

  private

  def appointment(patient, site, starts_at, ends_at, status: "scheduled")
    @practice.appointments.create!(patient:, site:, booked_clinician: @clinician, visit_type: @type,
      starts_at:, ends_at:, status:, visit_modality: "in_person")
  end

  def waitlist(practice, patient, site, clinician, visit_type)
    Clinic::Scheduling::WaitlistEntry.create!(practice:, patient:, site:, clinician:, visit_type:,
      earliest_at: @start, latest_at: @start + 5.hours, duration_minutes: 45, state: "waiting", reason: "Synthetic request")
  end

  def login
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def get_queue(**params)
    get "/api/clinic/appointments", params: { queue_context: "true", date: @date.iso8601 }.merge(params), headers: @headers
  end

  def get_calendar(**params)
    get "/api/clinic/schedule_calendar", params: { site_id: @site.id, date: @date.iso8601 }.merge(params), headers: @headers
  end

  def calendar_day
    response.parsed_body.fetch("days").find { |day| day.fetch("date") == @date.iso8601 } || raise("Missing synthetic calendar day")
  end
end
