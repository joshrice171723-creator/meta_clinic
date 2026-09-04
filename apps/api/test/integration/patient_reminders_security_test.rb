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

  private

  def create_endpoint(practice, patient, value)
    practice.communication_endpoints.create!(
      patient: patient,
      endpoint_type: "email",
      value: value,
      value_digest: Digest::SHA256.hexdigest(value),
      verified_at: Time.current
    )
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
