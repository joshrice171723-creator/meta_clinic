require "test_helper"

class ReminderExceptionQueueTest < ActionDispatch::IntegrationTest
  setup do
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Reminder Exception Queue Organization")
    @user = User.create!(email_address: "reminder-exception-queue@example.invalid", password: @password)
    @practice = Clinic::Practice.create!(name: "Reminder Exception Queue Practice", organization: organization)
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "reminders.read", "reminders.write", "staff_messaging.read",
      "staff_messaging.send", "staff_messaging.create_conversation", "staff_messaging.transition")
    coworker = User.create!(email_address: "reminder-exception-coworker@example.invalid", password: SecureRandom.hex(18))
    coworker_membership = @practice.memberships.create!(user: coworker)
    @conversation = Clinic::Messaging::CreateStaffConversation.call(
      practice: @practice, actor: @user, request_key: "reminder-exception-conversation",
      kind: "direct", member_ids: [ coworker_membership.id ]
    )
    @patient = @practice.patients.create!(display_name: "Reminder Patient", reference: "REMINDER-EXCEPTION-001")
    @endpoint = endpoint_for(@practice, @patient, "reminder-patient@example.invalid")

    other_user = User.create!(email_address: "reminder-exception-other@example.invalid", password: SecureRandom.hex(18))
    other_practice = Clinic::Practice.create!(name: "Other Reminder Exception Practice", organization: organization)
    other_membership = other_practice.memberships.create!(user: other_user)
    grant_permissions!(other_membership, "reminders.write")
    other_patient = other_practice.patients.create!(display_name: "Other Reminder Patient", reference: "REMINDER-EXCEPTION-002")
    other_endpoint = endpoint_for(other_practice, other_patient, "other-reminder@example.invalid")
    @other_reminder = failed_reminder(other_practice, other_user, other_patient, other_endpoint, "foreign-failure")

    login
  end

  test "attention endpoint selects actionable reminders only within the current practice" do
    own_reminder = failed_reminder(@practice, @user, @patient, @endpoint, "own-failure")
    create_reminder(@practice, @user, @patient, @endpoint, "scheduled-control")

    ids = attention_ids
    assert_equal [ own_reminder.id ], ids
    assert_not_includes ids, @other_reminder.id
  end

  test "a newer patient action supersedes a resolved earlier source" do
    reminder = failed_reminder(@practice, @user, @patient, @endpoint, "newest-action")
    earlier = record_action(reminder, "request_reschedule", "earlier-reschedule")
    resolve!(handoff(reminder, action_id: earlier.id))

    assert_not_includes attention_ids, reminder.id

    latest = record_action(reminder, "request_help", "later-help")
    get "/api/clinic/reminders", params: { attention: true }, headers: @headers

    assert_response :success
    row = response.parsed_body.fetch("reminders").find { |item| item.fetch("id").to_i == reminder.id }
    assert row
    assert_equal latest.id, row.dig("staff_handoff", "source_id")
    assert_equal "request_help", row.dig("staff_handoff", "reason_code")
  end

  test "only a resolved current source leaves declined and expired work visible" do
    requests = %w[resolved declined expired].to_h do |state|
      reminder = failed_reminder(@practice, @user, @patient, @endpoint, "#{state}-handoff")
      action = record_action(reminder, "request_help", "#{state}-help")
      request = handoff(reminder, action_id: action.id)
      transition!(request, state)
      [ state, reminder ]
    end

    ids = attention_ids
    assert_not_includes ids, requests.fetch("resolved").id
    assert_includes ids, requests.fetch("declined").id
    assert_includes ids, requests.fetch("expired").id
  end

  private

  def attention_ids
    get "/api/clinic/reminders", params: { attention: true }, headers: @headers
    assert_response :success
    response.parsed_body.fetch("reminders").map { |reminder| reminder.fetch("id").to_i }
  end

  def create_reminder(practice, actor, patient, endpoint, key)
    Clinic::Reminders::Create.call(
      practice: practice, actor: actor, patient: patient, request_key: key,
      category: "appointment", channel: "email", scheduled_at: 1.day.from_now,
      endpoint_id: endpoint.id
    )
  end

  def failed_reminder(practice, actor, patient, endpoint, key)
    reminder = create_reminder(practice, actor, patient, endpoint, key)
    reminder.delivery_attempts.create!(
      practice: practice, attempt_number: 1, provider: "local_test",
      idempotency_key: "#{key}-attempt", status: "failed", failure_class: "provider_unavailable",
      retryable: false, masked_destination: endpoint.masked_value, queued_at: Time.current,
      completed_at: Time.current
    )
    reminder.update!(status: "failed", policy_decision_code: "retry_limit_reached")
    reminder
  end

  def record_action(reminder, type, key)
    Clinic::Reminders::RecordAction.call(
      reminder: reminder, patient: @patient, actor: @user, request_key: key, action_type: type
    )
  end

  def handoff(reminder, action_id:)
    Clinic::Reminders::StaffHandoff.call(
      practice: @practice, actor: @user, reminder: reminder, conversation_id: @conversation.id,
      assignee_membership_id: @membership.id, due_at: 2.days.from_now, action_id: action_id
    )
  end

  def resolve!(request)
    transition!(request, "resolved")
  end

  def transition!(request, state)
    Clinic::Messaging::TransitionStaffRequest.call(
      practice: @practice, actor: @user, request: request, state: state,
      resolution_code: state == "resolved" ? "follow_up_completed" : nil
    )
  end

  def endpoint_for(practice, patient, value)
    practice.communication_endpoints.create!(
      patient: patient, endpoint_type: "email", value: value,
      value_digest: Digest::SHA256.hexdigest(value), verified_at: Time.current
    )
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def login
    post "/api/session", params: { email_address: @user.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end
end
