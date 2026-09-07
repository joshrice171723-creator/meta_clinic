require "test_helper"

class ClinicFollowUpsTest < ActionDispatch::IntegrationTest
  setup do
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Follow-up Worklist Organization")
    @user = User.create!(email_address: "follow-up-owner@example.invalid", password: @password)
    @practice = Clinic::Practice.create!(name: "Follow-up Worklist Practice", organization: organization)
    @membership = @practice.memberships.create!(user: @user)
    @coworker = create_membership(@practice, "follow-up-coworker@example.invalid")
    grant_permissions!(@membership, "staff_messaging.read")
    login
  end

  test "returns actionable requests from active conversations with minimal labels" do
    conversation = create_conversation(title: "Review lab callback", members: [ @membership, @coworker ])
    included = create_request(conversation: conversation, assignee: @coworker, due_at: 1.hour.from_now)
    create_request(conversation: conversation, assignee: @membership, due_at: 2.hours.from_now, state: "resolved")
    create_request(conversation: conversation, assignee: @membership, due_at: 2.hours.from_now, message_status: "retracted")
    archived = create_conversation(title: "Archived follow-up", members: [ @membership, @coworker ], status: "archived")
    create_request(conversation: archived, assignee: @membership, due_at: 3.hours.from_now)

    get follow_ups_path, headers: @headers

    assert_response :success
    assert_equal [ included.id ], request_ids
    assert_equal({ "open" => 1, "overdue" => 0, "mine" => 0, "unassigned" => 0 }, response.parsed_body.fetch("summary"))
    row = response.parsed_body.fetch("requests").first
    assert_equal conversation.id, row.fetch("conversation_id")
    assert_equal "Review lab callback", row.fetch("subject")
    assert_equal "Review the operational follow-up", row.fetch("requested_action")
    assert_equal @coworker.user.email_address, row.fetch("assignee_label")
    assert_equal false, row.fetch("assigned_to_me")
    assert_equal false, row.fetch("overdue")
    assert_not row.key?("patient_label")
  end

  test "does not grant conversation creators or other practices access to private requests" do
    hidden_member = create_membership(@practice, "follow-up-hidden@example.invalid")
    hidden_peer = create_membership(@practice, "follow-up-hidden-peer@example.invalid")
    private_conversation = create_conversation(
      title: "Private request",
      members: [ hidden_member, hidden_peer ],
      creator: @membership
    )
    private_request = create_request(conversation: private_conversation, assignee: hidden_member, due_at: 1.hour.from_now)

    other_practice = Clinic::Practice.create!(
      name: "Other Follow-up Practice",
      organization: @practice.organization
    )
    other_member = create_membership(other_practice, "follow-up-other@example.invalid")
    other_peer = create_membership(other_practice, "follow-up-other-peer@example.invalid")
    foreign_conversation = create_conversation(
      practice: other_practice,
      title: "Other practice request",
      members: [ other_member, other_peer ],
      creator: other_member
    )
    foreign_request = create_request(
      practice: other_practice,
      conversation: foreign_conversation,
      assignee: other_member,
      due_at: 1.hour.from_now
    )

    get follow_ups_path, headers: @headers

    assert_response :success
    assert_empty request_ids
    assert_not_includes request_ids, private_request.id
    assert_not_includes request_ids, foreign_request.id
    assert_equal 0, response.parsed_body.dig("summary", "open")
  end

  test "filters mine overdue and unassigned without changing the accessible summary" do
    travel_to Time.utc(2026, 9, 7, 16) do
      login
      conversation = create_conversation(title: "Filter requests", members: [ @membership, @coworker ])
      mine = create_request(conversation: conversation, assignee: @membership, due_at: 30.minutes.ago)
      unassigned = create_request(conversation: conversation, assignee: nil, due_at: 1.hour.from_now)
      coworker = create_request(conversation: conversation, assignee: @coworker, due_at: 2.hours.from_now, state: "acknowledged")
      expected_summary = { "open" => 3, "overdue" => 1, "mine" => 1, "unassigned" => 1 }

      { "mine" => [ mine.id ], "overdue" => [ mine.id ], "unassigned" => [ unassigned.id ],
        "all" => [ mine.id, unassigned.id, coworker.id ] }.each do |filter, expected_ids|
        get follow_ups_path, params: { filter: filter }, headers: @headers

        assert_response :success
        assert_equal expected_ids, request_ids
        assert_equal expected_summary, response.parsed_body.fetch("summary")
      end
    end
  end

  test "applies site-scoped messaging access and validates filters and site ids" do
    allowed_site = @practice.sites.create!(code: "FOLLOW-UP-ALLOWED")
    denied_site = @practice.sites.create!(code: "FOLLOW-UP-DENIED")
    allowed = create_request(
      conversation: create_conversation(title: "Allowed site", members: [ @membership, @coworker ], site: allowed_site),
      assignee: @membership,
      due_at: 1.hour.from_now
    )
    create_request(
      conversation: create_conversation(title: "Denied site", members: [ @membership, @coworker ], site: denied_site),
      assignee: @membership,
      due_at: 1.hour.from_now
    )
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "staff_messaging.read", scope_kind: "site", site: allowed_site)

    get follow_ups_path, headers: @headers
    assert_response :success
    assert_equal [ allowed.id ], request_ids

    get follow_ups_path, params: { site_id: allowed_site.id }, headers: @headers
    assert_response :success
    assert_equal [ allowed.id ], request_ids

    get follow_ups_path, params: { site_id: denied_site.id }, headers: @headers
    assert_response :forbidden

    get follow_ups_path, params: { site_id: "not-an-id" }, headers: @headers
    assert_response :bad_request

    get follow_ups_path, params: { filter: "closed" }, headers: @headers
    assert_response :bad_request
  end

  test "counts reminder exceptions only with reminder read permission" do
    patient = @practice.patients.create!(display_name: "Reminder Patient", reference: "FOLLOW-UP-REMINDER-001")
    endpoint = @practice.communication_endpoints.create!(
      patient: patient,
      endpoint_type: "email",
      value: "follow-up-reminder@example.invalid",
      value_digest: Digest::SHA256.hexdigest("follow-up-reminder@example.invalid"),
      verified_at: Time.current
    )
    grant_permissions!(@membership, "reminders.write")
    failed_reminder(@practice, @user, patient, endpoint, "follow-up-failed")
    create_reminder(@practice, @user, patient, endpoint, "follow-up-scheduled")

    get follow_ups_path, headers: @headers
    assert_response :success
    assert_nil response.parsed_body.fetch("reminder_attention_count")

    grant_permissions!(@membership, "reminders.read")
    get follow_ups_path, headers: @headers
    assert_response :success
    assert_equal 1, response.parsed_body.fetch("reminder_attention_count")

    site = @practice.sites.create!(code: "FOLLOW-UP-REMINDER-SITE")
    get follow_ups_path, params: { site_id: site.id }, headers: @headers
    assert_response :success
    assert_nil response.parsed_body.fetch("reminder_attention_count")
  end

  private

  def follow_ups_path
    "/api/clinic/operations/follow_ups"
  end

  def request_ids
    response.parsed_body.fetch("requests").map { |request| request.fetch("id") }
  end

  def create_membership(practice, email)
    user = User.create!(email_address: email, password: SecureRandom.hex(18))
    practice.memberships.create!(user: user)
  end

  def create_conversation(title:, members:, practice: @practice, creator: members.first, site: nil, status: "active")
    conversation = Clinic::StaffConversation.create!(
      practice: practice,
      site: site,
      kind: "direct",
      title: title,
      status: status,
      created_by_membership: creator,
      retention_class: "routine"
    )
    members.each do |membership|
      conversation.members.create!(practice: practice, membership: membership, joined_at: Time.current)
    end
    conversation
  end

  def create_request(conversation:, assignee:, due_at:, state: "open", message_status: "active", practice: conversation.practice)
    message = conversation.messages.create!(
      practice: practice,
      sender_membership: conversation.created_by_membership,
      body: "Synthetic operational follow-up",
      message_class: "urgent",
      status: message_status,
      request_key: "follow-up-#{SecureRandom.hex(10)}",
      requested_action: "Review the operational follow-up",
      response_due_at: due_at
    )
    message.create_request!(practice: practice, assignee_membership: assignee, due_at: due_at, state: state)
  end

  def create_reminder(practice, actor, patient, endpoint, key)
    Clinic::Reminders::Create.call(
      practice: practice,
      actor: actor,
      patient: patient,
      request_key: key,
      category: "appointment",
      channel: "email",
      scheduled_at: 1.day.from_now,
      endpoint_id: endpoint.id
    )
  end

  def failed_reminder(practice, actor, patient, endpoint, key)
    reminder = create_reminder(practice, actor, patient, endpoint, key)
    reminder.delivery_attempts.create!(
      practice: practice,
      attempt_number: 1,
      provider: "local_test",
      idempotency_key: "#{key}-attempt",
      status: "failed",
      failure_class: "provider_unavailable",
      retryable: false,
      masked_destination: endpoint.masked_value,
      queued_at: Time.current,
      completed_at: Time.current
    )
    reminder.update!(status: "failed", policy_decision_code: "retry_limit_reached")
    reminder
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
