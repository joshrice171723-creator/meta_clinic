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
      "staff_messaging.send", "staff_messaging.create_conversation", "staff_messaging.transition",
      "encounters.write")
    coworker = User.create!(email_address: "reminder-exception-coworker@example.invalid", password: SecureRandom.hex(18))
    coworker_membership = @practice.memberships.create!(user: coworker)
    grant_permissions!(coworker_membership, "staff_messaging.read")
    @conversation = Clinic::Messaging::CreateStaffConversation.call(
      practice: @practice, actor: @user, request_key: "reminder-exception-conversation",
      kind: "direct", member_ids: [ coworker_membership.id ]
    )
    @patient = @practice.patients.create!(display_name: "Reminder Patient", reference: "REMINDER-EXCEPTION-001")
    @site = @practice.sites.create!(code: "REMINDER-MAIN")
    @encounter = @practice.encounters.create!(patient: @patient, site: @site,
      status: "open", started_at: Time.current)
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

  test "delivery-unknown handoff tells staff to reconcile before any retry" do
    reminder = create_reminder(@practice, @user, @patient, @endpoint, "unknown-delivery")
    reminder.delivery_attempts.create!(
      practice: @practice, attempt_number: 1, provider: "local_test",
      idempotency_key: "unknown-delivery-attempt", status: "unknown",
      failure_class: "provider_outcome_unknown", retryable: false,
      masked_destination: @endpoint.masked_value, queued_at: Time.current,
      completed_at: Time.current
    )
    reminder.update!(status: "delivery_unknown", policy_decision_code: "provider_outcome_unknown")

    request = Clinic::Reminders::StaffHandoff.call(
      practice: @practice, actor: @user, reminder: reminder,
      conversation_id: @conversation.id, assignee_membership_id: @membership.id,
      due_at: 2.days.from_now
    )

    assert_equal "Reconcile the delivery outcome before any resend. Do not send a duplicate while delivery is uncertain.",
      request.message.requested_action
    task = Clinic::ClinicalTask.find_by!(source_type: "reminder", source_id: reminder.id)
    assert_equal @patient.id, task.patient_id
    assert_equal @membership.id, task.assigned_to_membership_id
    assert_equal "staff_request", task.task_kind
    assert_equal "open", task.state
  end

  test "patient-linked staff requests share one task lifecycle with the work queue" do
    message = Clinic::Messaging::SendStaffMessage.call(
      practice: @practice, actor: @user, conversation: @conversation,
      request_key: "encounter-staff-request", body: "Review the encounter follow-up.",
      message_class: "time_sensitive", response_due_at: 1.day.from_now,
      assignee_membership_id: @membership.id, requested_action: "Review follow-up",
      linked_object_type: "encounter", linked_object_id: @encounter.id
    )
    request = message.request
    task = Clinic::ClinicalTask.find_by!(source_type: "message", source_id: request.id)
    assert_equal [ @patient.id, @encounter.id, @site.id ], [ task.patient_id, task.encounter_id, task.site_id ]
    assert_equal "open", task.state

    Clinic::Messaging::TransitionStaffRequest.call(
      practice: @practice, actor: @user, request: request, state: "in_progress"
    )
    assert_equal "in_progress", task.reload.state

    Clinic::Messaging::TransitionStaffRequest.call(
      practice: @practice, actor: @user, request: request.reload, state: "resolved",
      resolution_code: "follow_up_completed"
    )
    assert_equal "completed", task.reload.state
    assert_equal "completed", task.resolution_code
    assert_equal 1, Clinic::ClinicalTask.where(source_type: "message", source_id: request.id).count
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
