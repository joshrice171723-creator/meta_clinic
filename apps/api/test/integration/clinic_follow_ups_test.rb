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
    travel_to Time.current.change(usec: 0) do
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

  test "staff inbox supports durable ownership handoff response targets and overdue escalation" do
    grant_permissions!(@membership, "staff_messaging.transition", "staff_messaging.escalate")
    backup = create_membership(@practice, "follow-up-backup@example.invalid")
    conversation = create_conversation(
      title: "Urgent handoff",
      members: [ @membership, @coworker, backup ]
    )
    request = create_request(conversation: conversation, assignee: nil, due_at: 1.hour.from_now)

    get follow_ups_path, headers: @headers
    assert_response :success
    row = response.parsed_body.fetch("requests").sole
    assert_equal @membership.id, response.parsed_body.fetch("actor_membership_id")
    assert_equal true, response.parsed_body.fetch("can_manage_staff_requests")
    assert_equal [ @membership.id, backup.id, @coworker.id ].sort,
      row.fetch("eligible_assignees").pluck("membership_id").sort

    patch "/api/clinic/staff-messaging/requests/#{request.id}/manage", params: {
      management: { request_key: "inbox-claim", action: "claim" }
    }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal @membership.id, request.reload.assignee_membership_id

    transfer = {
      management: {
        request_key: "inbox-transfer",
        action: "assign",
        assignee_membership_id: @coworker.id
      }
    }
    patch "/api/clinic/staff-messaging/requests/#{request.id}/manage",
      params: transfer, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal @coworker.id, request.reload.assignee_membership_id
    assert_no_difference "Clinic::OperationReceipt.count" do
      patch "/api/clinic/staff-messaging/requests/#{request.id}/manage",
        params: transfer, headers: csrf_headers, as: :json
      assert_response :success
    end

    target = 5.minutes.from_now.change(usec: 0)
    patch "/api/clinic/staff-messaging/requests/#{request.id}/manage", params: {
      management: { request_key: "inbox-target", action: "schedule", due_at: target.iso8601 }
    }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal target, request.reload.due_at

    travel_to target + 1.minute do
      post "/api/clinic/staff-messaging/requests/#{request.id}/escalate", params: {
        escalation: { request_key: "inbox-overdue-escalation", trigger: "overdue_recovery" }
      }, headers: csrf_headers, as: :json
      assert_response :created
    end
    escalation = request.escalations.sole
    assert_equal backup.id, escalation.target_membership_id
    assert_equal "overdue_recovery", escalation.trigger
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

  test "staff conversation filters preserve site visibility without query growth" do
    allowed_site = @practice.sites.create!(code: "MESSAGING-ALLOWED")
    denied_site = @practice.sites.create!(code: "MESSAGING-DENIED")
    assigned = create_conversation(title: "Assigned urgent", members: [ @membership, @coworker ], site: allowed_site)
    assigned_message = create_staff_message(
      conversation: assigned, sender: @coworker, message_class: "urgent", recipient: @membership
    )
    assigned_message.create_request!(
      practice: @practice, assignee_membership: @membership, due_at: 1.hour.from_now, state: "open"
    )
    unread_only = create_conversation(title: "Unread routine", members: [ @membership, @coworker ], site: allowed_site)
    create_staff_message(
      conversation: unread_only, sender: @coworker, message_class: "routine", recipient: @membership
    )
    urgent_only = create_conversation(title: "Read urgent", members: [ @membership, @coworker ], site: allowed_site)
    create_staff_message(
      conversation: urgent_only, sender: @coworker, message_class: "safety_critical",
      recipient: @membership, read_at: Time.current
    )
    denied = create_conversation(title: "Denied urgent", members: [ @membership, @coworker ], site: denied_site)
    denied_message = create_staff_message(
      conversation: denied, sender: @coworker, message_class: "urgent", recipient: @membership
    )
    denied_message.create_request!(
      practice: @practice, assignee_membership: @membership, due_at: 1.hour.from_now, state: "open"
    )

    omni = User.create!(email_address: "omni@test.com", admin: true, password: SecureRandom.hex(18))
    omni_membership = @practice.memberships.create!(user: omni)
    [ assigned, denied ].each do |conversation|
      conversation.members.create!(practice: @practice, membership: omni_membership, joined_at: Time.current)
    end
    omni_visible = Clinic::Messaging::ConversationIndex.call(
      practice: @practice,
      ability: Ability.new(omni, practice: @practice),
      membership: omni_membership,
      filter: "urgent"
    )
    assert_equal [ assigned.id, denied.id ].sort, omni_visible.pluck(:id).sort

    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "staff_messaging.read", scope_kind: "site", site: allowed_site)

    assert_equal [ assigned.id, unread_only.id ].sort, staff_conversation_ids("unread").sort
    assert_equal [ assigned.id, urgent_only.id ].sort, staff_conversation_ids("urgent").sort
    assert_equal [ assigned.id ], staff_conversation_ids("assigned")
    assert_equal [ assigned.id ], staff_conversation_ids("unresolved")

    baseline_queries = staff_conversation_query_count("urgent")
    8.times do |index|
      conversation = create_conversation(
        title: "Additional urgent #{index}", members: [ @membership, @coworker ], site: allowed_site
      )
      create_staff_message(
        conversation: conversation, sender: @coworker, message_class: "urgent", recipient: @membership
      )
    end
    expanded_queries = staff_conversation_query_count("urgent")

    assert_operator expanded_queries, :<=, baseline_queries + 1
  end

  test "staff conversation participant names prefer clinician and fall back to current employment" do
    @membership.create_clinician_profile!(practice: @practice, display_name: "Synthetic clinician")
    @coworker.create_clinician_profile!(practice: @practice, display_name: " ")
    create_participant_employment(@membership, name: "Synthetic workforce alternative")
    create_participant_employment(@coworker, name: "Synthetic workforce fallback")
    unnamed = create_membership(@practice, "synthetic-unnamed-participant@example.invalid")
    conversation = create_conversation(title: "Synthetic participant names", members: [@membership, @coworker, unnamed])

    participants = staff_conversation_participants(conversation)

    assert_equal "Synthetic clinician", participants.fetch(@membership.id).fetch("display_name")
    assert_equal "Synthetic workforce fallback", participants.fetch(@coworker.id).fetch("display_name")
    assert_nil participants.fetch(unnamed.id).fetch("display_name")
    assert_equal @coworker.user.email_address, participants.fetch(@coworker.id).fetch("email")
    assert_equal true, participants.fetch(@coworker.id).fetch("active")
  end

  test "staff conversation participant names retain effective employment boundaries" do
    travel_to(Time.utc(2026, 10, 4, 12)) do
      login
      at = Current.business_time
      current = create_membership(@practice, "synthetic-current-participant@example.invalid")
      future = create_membership(@practice, "synthetic-future-participant@example.invalid")
      ended = create_membership(@practice, "synthetic-ended-participant@example.invalid")
      inactive = create_membership(@practice, "synthetic-inactive-participant@example.invalid")
      create_participant_employment(current, name: "Synthetic current name", effective_from: at, effective_until: at + 1.hour)
      create_participant_employment(future, name: "Synthetic future name", effective_from: at + 1.second)
      create_participant_employment(ended, name: "Synthetic ended name", effective_from: at - 1.hour, effective_until: at)
      create_participant_employment(inactive, name: "Synthetic inactive name", status: "inactive", effective_from: at - 1.hour)
      conversation = create_conversation(title: "Synthetic employment windows", members: [@membership, current, future, ended, inactive])

      participants = staff_conversation_participants(conversation)

      assert_equal "Synthetic current name", participants.fetch(current.id).fetch("display_name")
      [future, ended, inactive].each { |membership| assert_nil participants.fetch(membership.id).fetch("display_name") }
    end
  end

  test "staff conversation participant names are refreshed for each request" do
    employment = create_participant_employment(@coworker, name: "Synthetic first name")
    conversation = create_conversation(title: "Synthetic refreshed names", members: [@membership, @coworker])
    assert_equal "Synthetic first name", staff_conversation_participants(conversation).fetch(@coworker.id).fetch("display_name")

    employment.staff_member.update!(display_name: "Synthetic updated name")
    assert_equal "Synthetic updated name", staff_conversation_participants(conversation).fetch(@coworker.id).fetch("display_name")

    employment.update!(status: "inactive")
    assert_nil staff_conversation_participants(conversation).fetch(@coworker.id).fetch("display_name")
  end

  test "staff participant name batching rejects memberships from another practice" do
    other_practice = Clinic::Practice.create!(name: "Synthetic other name practice")
    other_membership = create_membership(other_practice, "synthetic-foreign-name@example.invalid")

    assert_raises(ArgumentError) do
      Clinic::StaffMessagingSerializer.participant_display_names([other_membership], practice: @practice)
    end
  end

  test "marking staff messages read rolls back receipt and cursor when audit recording fails" do
    conversation = create_conversation(title: "Atomic read", members: [ @membership, @coworker ])
    message = create_staff_message(
      conversation: conversation, sender: @coworker, message_class: "routine", recipient: @membership
    )
    receipt = message.receipts.find_by!(recipient_membership_id: @membership.id)
    conversation_member = conversation.members.find_by!(membership_id: @membership.id)
    audit_failure = Class.new(StandardError)
    original_record = Clinic::AuditRecorder.method(:record!)

    Clinic::AuditRecorder.define_singleton_method(:record!) do |**|
      raise audit_failure, "synthetic audit failure"
    end
    begin
      assert_raises(audit_failure) do
        PaperTrail.request(whodunnit: @user.id.to_s, controller_info: { request_id: "atomic-read-rollback" }) do
          Clinic::Messaging::MarkStaffMessageRead.call(
            practice: @practice, actor: @user, conversation: conversation
          )
        end
      end
    ensure
      Clinic::AuditRecorder.define_singleton_method(:record!, original_record)
    end

    assert_nil receipt.reload.read_at
    assert_nil receipt.presented_at
    assert_nil conversation_member.reload.last_read_message_id
    assert_nil conversation_member.last_read_at

    Clinic::Messaging::MarkStaffMessageRead.call(
      practice: @practice, actor: @user, conversation: conversation
    )
    assert_not_nil receipt.reload.read_at
    assert_equal message.id, conversation_member.reload.last_read_message_id
  end

  test "staff request pages reach later matching work without counting inaccessible conversations" do
    allowed_site = @practice.sites.create!(code: "PAGE-ALLOWED")
    denied_site = @practice.sites.create!(code: "PAGE-DENIED")
    conversation = create_conversation(title: "Synthetic paged requests", members: [@membership, @coworker], site: allowed_site)
    due_at = 1.hour.from_now.change(usec: 0)
    requests = 51.times.map { create_request(conversation: conversation, assignee: @membership, due_at: due_at) }
    denied = create_conversation(title: "Synthetic other location", members: [@membership, @coworker], site: denied_site)
    create_request(conversation: denied, assignee: @membership, due_at: due_at)
    hidden_peer = create_membership(@practice, "synthetic-page-private@example.invalid")
    private_conversation = create_conversation(title: "Synthetic private", members: [@coworker, hidden_peer])
    create_request(conversation: private_conversation, assignee: @coworker, due_at: due_at)
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "staff_messaging.read", scope_kind: "site", site: allowed_site)

    get follow_ups_path, params: { filter: "mine", staff_requests_page: 1 }, headers: @headers
    assert_response :success
    assert_equal requests.first(50).map(&:id), request_ids
    assert_equal({ "page" => 1, "per_page" => 50, "total" => 51, "total_pages" => 2 }, response.parsed_body.fetch("staff_requests_page"))
    assert_equal 0, response.parsed_body.dig("encounter_follow_ups_page", "total")
    assert_equal 0, response.parsed_body.dig("renewal_exceptions_page", "total")

    get follow_ups_path, params: { filter: "mine", staff_requests_page: 2 }, headers: @headers
    assert_response :success
    assert_equal [requests.last.id], request_ids
    assert_equal conversation.id, response.parsed_body.fetch("requests").sole.fetch("conversation_id")

    get follow_ups_path, params: { filter: "mine", staff_requests_page: 999 }, headers: @headers
    assert_response :success
    assert_equal 2, response.parsed_body.dig("staff_requests_page", "page")
    assert_equal [requests.last.id], request_ids

    get follow_ups_path, params: { filter: "overdue", staff_requests_page: 2 }, headers: @headers
    assert_response :success
    assert_empty request_ids
    assert_equal({ "page" => 1, "per_page" => 50, "total" => 0, "total_pages" => 0 }, response.parsed_body.fetch("staff_requests_page"))
  end

  test "encounter follow-up pages retain closed-encounter work and count only permitted sites" do
    allowed_site = @practice.sites.create!(code: "FOLLOW-UP-PAGE-ALLOWED")
    denied_site = @practice.sites.create!(code: "FOLLOW-UP-PAGE-DENIED")
    grant_permissions!(@membership, "patients.read")
    grant_permissions!(@membership, "encounters.write", scope_kind: "site", site: allowed_site)
    patient = @practice.patients.create!(display_name: "Synthetic Paged Patient", reference: "PAGE-001")
    due_at = 1.hour.from_now.change(usec: 0)
    create_follow_up = lambda do |site|
      encounter = @practice.encounters.create!(patient: patient, site: site,
        started_at: 2.hours.ago, ended_at: 1.hour.ago, status: "completed")
      Clinic::EncounterFollowUp.create!(practice: @practice, patient: patient, encounter: encounter,
        source_kind: "in_person", state: "needed", plan: "Synthetic return visit", outcome: "", due_at: due_at,
        assigned_to_membership: @membership, recorded_by_membership: @membership, updated_by_membership: @membership)
    end
    follow_ups = 51.times.map { create_follow_up.call(allowed_site) }
    create_follow_up.call(denied_site)

    get follow_ups_path, params: { filter: "mine", encounter_follow_ups_page: 2 }, headers: @headers
    assert_response :success
    assert_equal({ "page" => 2, "per_page" => 50, "total" => 51, "total_pages" => 2 }, response.parsed_body.fetch("encounter_follow_ups_page"))
    row = response.parsed_body.fetch("encounter_follow_ups").sole
    assert_equal follow_ups.last.id, row.fetch("id")
    assert_equal follow_ups.last.encounter_id, row.fetch("encounter_id")
    assert_equal patient.id, row.fetch("patient_id")
    assert_equal 1, response.parsed_body.dig("staff_requests_page", "page")
    assert_equal "completed", follow_ups.last.encounter.reload.status
    assert_equal "needed", follow_ups.last.reload.state
  end

  test "each queue page rejects nonpositive and unbounded parameters" do
    %w[staff_requests_page encounter_follow_ups_page renewal_exceptions_page].each do |field|
      ["0", "-1", "1.5", "1000001"].each do |invalid|
        get follow_ups_path, params: { field => invalid }, headers: @headers
        assert_response :bad_request
      end
    end
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

  def create_staff_message(conversation:, sender:, message_class:, recipient:, read_at: nil)
    message = conversation.messages.create!(
      practice: conversation.practice,
      sender_membership: sender,
      body: "Synthetic staff message",
      message_class: message_class,
      status: "active",
      request_key: "staff-message-#{SecureRandom.hex(10)}"
    )
    message.receipts.create!(
      practice: conversation.practice,
      recipient_membership: recipient,
      delivered_at: Time.current,
      presented_at: read_at,
      read_at: read_at
    )
    conversation.update!(last_message_at: Time.current)
    message
  end

  def create_participant_employment(membership, name:, status: "active", effective_from: Current.business_time - 1.hour, effective_until: nil)
    staff = @practice.staff_members.create!(display_name: name, job_title: "Synthetic coordinator", active: true)
    Clinic::Workforce::Employment.create!(practice: @practice, membership: membership, staff_member: staff,
      status: status, effective_from: effective_from, effective_until: effective_until)
  end

  def staff_conversation_participants(conversation)
    get "/api/clinic/staff-messaging/conversations", headers: @headers
    assert_response :success
    row = response.parsed_body.fetch("conversations").find { |record| record.fetch("id") == conversation.id }
    assert_not_nil row
    row.fetch("participants").index_by { |participant| participant.fetch("id") }
  end

  def staff_conversation_ids(filter)
    get "/api/clinic/staff-messaging/conversations", params: { filter: filter }, headers: @headers
    assert_response :success
    response.parsed_body.fetch("conversations").map { |conversation| conversation.fetch("id") }
  end

  def staff_conversation_query_count(filter)
    queries = []
    subscriber = lambda do |_name, _started, _finished, _unique_id, payload|
      sql = payload[:sql].to_s.lstrip
      queries << sql if sql.match?(/\ASELECT\b/i)
    end
    ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") do
      get "/api/clinic/staff-messaging/conversations", params: { filter: filter }, headers: @headers
    end
    assert_response :success
    queries.length
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
