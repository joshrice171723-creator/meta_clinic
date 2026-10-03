require "test_helper"

class PatientRemindersSecurityTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @other_password = SecureRandom.hex(18)

    organization = Organization.create!(name: "Synthetic Reminder Security Organization")
    @user = User.create!(email_address: "reminder-security@example.invalid", password: @password)
    @other_user = User.create!(email_address: "reminder-security-other@example.invalid", password: @other_password)
    @practice = Clinic::Practice.create!(name: "Synthetic Reminder Security Practice", organization: organization)
    @other_practice = Clinic::Practice.create!(name: "Synthetic Other Reminder Practice", organization: organization)
    @membership = @practice.memberships.create!(user: @user)
    other_membership = @other_practice.memberships.create!(user: @other_user)
    grant_permissions!(@membership, "reminders.read", "reminders.write")
    grant_permissions!(other_membership, "reminders.read", "reminders.write")

    @patient = @practice.patients.create!(display_name: "SYN_Reminder, Avery", reference: "SYN-REMINDER-001")
    @other_patient = @other_practice.patients.create!(display_name: "SYN_Other Reminder, Blair", reference: "SYN-REMINDER-002")
    @endpoint = create_endpoint(@practice, @patient, "avery@example.invalid")
    other_endpoint = create_endpoint(@other_practice, @other_patient, "blair@example.invalid")
    @reminder = create_reminder(@practice, @user, @patient, @endpoint, "reminder-security-own")
    @other_reminder = create_reminder(@other_practice, @other_user, @other_patient, other_endpoint, "reminder-security-foreign")

    login
  end

  test "staff reminder reads and dispatches cannot cross practice boundaries" do
    get "/api/clinic/reminders", headers: @headers

    assert_response :success
    assert_equal [ @reminder.id.to_s ], response.parsed_body.fetch("reminders").map { |reminder| reminder.fetch("id").to_s }

    get "/api/clinic/reminders/#{@other_reminder.id}", headers: @headers
    assert_response :not_found

    post "/api/clinic/reminders/#{@other_reminder.id}/dispatch", headers: csrf_headers, as: :json
    assert_response :not_found
    assert_equal "scheduled", @other_reminder.reload.status
    assert_empty @other_reminder.delivery_attempts
  end

  test "staff reminder access requires the specific read and write capabilities" do
    revoke_all_permissions!(@membership)

    get "/api/clinic/reminders/#{@reminder.id}", headers: @headers
    assert_response :forbidden

    post "/api/clinic/reminders/#{@reminder.id}/dispatch", headers: csrf_headers, as: :json
    assert_response :forbidden
    assert_equal "scheduled", @reminder.reload.status
    assert_empty @reminder.delivery_attempts
  end

  test "custom SMS content uses the verified phone endpoint and appears in staff history with appointment context" do
    @patient.create_communication_preference!(
      practice: @practice,
      preferred_contact_method: "text",
      appointment_reminders_consent: true,
      general_communications_consent: false
    )
    phone = create_endpoint(@practice, @patient, "+15005550006", type: "phone")
    appointment = @practice.appointments.create!(
      patient: @patient,
      starts_at: 2.days.from_now,
      ends_at: 2.days.from_now + 30.minutes,
      status: "scheduled"
    )
    content = "Synthetic clinic reminder with custom wording."
    reminder = Clinic::Reminders::Create.call(
      practice: @practice,
      actor: @user,
      patient: @patient,
      appointment: appointment,
      request_key: "custom-sms-history",
      category: "appointment",
      channel: "sms",
      scheduled_at: Time.current,
      content: content
    )

    assert_equal phone.id, reminder.communication_endpoint_id
    assert_equal content, reminder.content
    stored = ApplicationRecord.connection.select_value(
      "SELECT content FROM clinic_patient_reminders WHERE id = #{Integer(reminder.id)}"
    )
    assert_not_equal content, stored

    with_environment("APPLY_REMINDERS_SYNTHETIC_DELIVERY" => "1") do
      Clinic::Reminders::Dispatch.call(reminder: reminder, actor: @user)
    end
    get "/api/clinic/reminders", params: { history: "sent", q: "Avery" }, headers: @headers

    assert_response :success
    row = response.parsed_body.fetch("reminders").sole
    assert_equal content, row.fetch("content")
    assert_equal @patient.display_name, row.dig("patient", "display_name")
    assert_equal appointment.id, row.dig("appointment", "id")
    assert_equal "synthetic", row.fetch("delivery_attempts").sole.fetch("provider")
  end

  test "reminder replay binds the appointment and expiry without changing the saved reminder" do
    scheduled_at = 1.day.from_now
    first = @practice.appointments.create!(patient: @patient, starts_at: scheduled_at + 1.day,
      ends_at: scheduled_at + 1.day + 30.minutes, status: "scheduled")
    second = @practice.appointments.create!(patient: @patient, starts_at: scheduled_at + 2.days,
      ends_at: scheduled_at + 2.days + 30.minutes, status: "scheduled")
    input = { reminder: { request_key: "source-expiry-replay", patient_id: @patient.id, appointment_id: first.id,
      category: "appointment", channel: "email", scheduled_at: scheduled_at.iso8601(6),
      endpoint_id: @endpoint.id, expires_at: (scheduled_at + 1.day).iso8601(6) } }
    post "/api/clinic/reminders", params: input, headers: csrf_headers, as: :json
    assert_response :created
    saved_id = response.parsed_body.fetch("id")
    count = @practice.patient_reminders.count
    post "/api/clinic/reminders", params: input, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal saved_id, response.parsed_body.fetch("id")
    [ { appointment_id: second.id }, { appointment_id: nil },
      { expires_at: (scheduled_at + 2.days).iso8601(6) } ].each do |changed|
      post "/api/clinic/reminders", params: input.deep_merge(reminder: changed), headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
      assert_match(/already used for different data/, response.parsed_body.fetch("error"))
      assert_equal count, @practice.patient_reminders.count
    end
    saved = @practice.patient_reminders.find(saved_id)
    assert_equal [ "Clinic::Appointment", first.id ], [ saved.source_type, saved.source_id ]
    assert_equal Time.iso8601(input[:reminder][:expires_at]), saved.expires_at
  end

  test "appointment SMS dispatch is suppressed when reminder consent is not recorded" do
    @patient.create_communication_preference!(
      practice: @practice,
      preferred_contact_method: "text",
      appointment_reminders_consent: false,
      general_communications_consent: false
    )
    phone = create_endpoint(@practice, @patient, "+15005550006", type: "phone")
    reminder = Clinic::Reminders::Create.call(
      practice: @practice,
      actor: @user,
      patient: @patient,
      request_key: "sms-without-consent",
      category: "appointment",
      channel: "sms",
      scheduled_at: Time.current,
      endpoint_id: phone.id,
      content: "Synthetic appointment reminder."
    )

    with_environment("APPLY_REMINDERS_SYNTHETIC_DELIVERY" => "1") do
      Clinic::Reminders::Dispatch.call(reminder: reminder, actor: @user)
    end

    assert_equal "suppressed", reminder.reload.status
    assert_equal "appointment_reminder_consent_missing", reminder.policy_decision_code
    assert_empty reminder.delivery_attempts
  end

  private

  def create_endpoint(practice, patient, value, type: "email")
    practice.communication_endpoints.create!(
      patient: patient,
      endpoint_type: type,
      value: value,
      value_digest: Digest::SHA256.hexdigest(value),
      verified_at: Time.current
    )
  end


  def with_environment(values)
    previous = values.to_h { |key, _value| [ key, ENV[key] ] }
    values.each { |key, value| ENV[key] = value }
    yield
  ensure
    previous.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end

  def create_reminder(practice, actor, patient, endpoint, request_key)
    Clinic::Reminders::Create.call(
      practice: practice,
      actor: actor,
      patient: patient,
      request_key: request_key,
      category: "appointment",
      channel: "email",
      scheduled_at: 1.day.from_now,
      endpoint_id: endpoint.id
    )
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def login
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end
end
