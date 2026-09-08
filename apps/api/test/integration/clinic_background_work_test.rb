require "test_helper"

class ClinicBackgroundWorkTest < ActionDispatch::IntegrationTest
  setup do
    @at = Time.utc(2026, 9, 7, 15)
    travel_to @at
    @organization = Organization.create!(name: "Background Work Test Organization")
    @practice = Clinic::Practice.create!(name: "Background Work Test Practice", organization: @organization, timezone: "UTC")
    @actor = User.create!(email_address: "background-work@example.invalid", password: SecureRandom.hex(20))
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "reminders.write", "staff_messaging.create_conversation", "staff_messaging.send")
    @site = @practice.sites.create!(code: "BACKGROUND")
    @patient = @practice.patients.create!(display_name: "SYN_Background, Avery", reference: "SYN-BACKGROUND-001")
    @endpoint = @practice.communication_endpoints.create!(
      patient: @patient, endpoint_type: "email", value: "background@example.invalid",
      value_digest: Digest::SHA256.hexdigest("background@example.invalid"), label: "Primary email", verified_at: @at
    )
    @patient.create_communication_preference!(
      practice: @practice, preferred_contact_method: "email", appointment_reminders_consent: true,
      general_communications_consent: false
    )
  end

  test "processes reminder and staff-message recovery through the initiating actor and clears context" do
    reminder = create_reminder(actor: @actor, key: "background-reminder-authorized")
    recipient = create_staff_member("background-recipient@example.invalid")
    conversation = with_actor(@actor) do
      Clinic::Messaging::CreateStaffConversation.call(
        practice: @practice, actor: @actor, request_key: "background-conversation", kind: "team",
        title: "Background recovery", site_id: @site.id, member_ids: [ recipient.id ]
      )
    end
    message = with_actor(@actor) do
      Clinic::Messaging::SendStaffMessage.call(
        practice: @practice, actor: @actor, conversation: conversation, request_key: "background-message",
        body: "Synthetic recovery notification."
      )
    end

    Current.business_date = Date.new(2026, 1, 1)
    PaperTrail.request.whodunnit = "contaminated"
    PaperTrail.request.controller_info = { request_id: "contaminated" }
    with_environment("APPLY_REMINDERS_PROVIDER" => "", "APPLY_REMINDERS_SYNTHETIC_DELIVERY" => "1") do
      result = Clinic::BackgroundWork.run_once(limit: 10, at: @at)

      assert_equal true, result.fetch(:lock_acquired)
      assert_equal 1, result.dig(:reminders, :processed)
      assert_equal 1, result.dig(:staff_messages, :processed)
    end

    assert_equal @actor.id.to_s, creation_actor_for(reminder.outbox)
    assert_equal @actor.id.to_s, creation_actor_for(message.outbox_events.sole)
    assert_equal "accepted", reminder.delivery_attempts.sole.status
    assert_equal @actor.id.to_s, creation_actor_for(reminder.delivery_attempts.sole)
    assert_equal "accepted", reminder.outbox.reload.dispatch_state
    assert_equal "provider_accepted", reminder.reload.status
    assert_equal "delivered", message.outbox_events.sole.reload.delivery_state
    assert_nil Current.attributes[:business_date]
    assert_nil PaperTrail.request.whodunnit
    assert_equal({}, PaperTrail.request.controller_info)
  end

  test "blocks reminder recovery when the initiating actor is unauthorized or unavailable" do
    unauthorized = create_reminder(actor: @actor, key: "background-reminder-unauthorized")
    former_actor = User.create!(email_address: "background-former@example.invalid", password: SecureRandom.hex(20))
    former_membership = @practice.memberships.create!(user: former_actor)
    grant_permissions!(former_membership, "reminders.write")
    unavailable = create_reminder(actor: former_actor, key: "background-reminder-unavailable")
    revoke_all_permissions!(@membership)
    former_actor.update!(active: false)

    result = Clinic::BackgroundWork.run_once(limit: 10, at: @at)

    assert_equal true, result.fetch(:lock_acquired)
    assert_equal 2, result.dig(:reminders, :considered)
    assert_equal 2, result.dig(:reminders, :blocked)
    [ unauthorized, unavailable ].each do |reminder|
      assert_equal "pending", reminder.outbox.reload.dispatch_state
      assert_empty reminder.delivery_attempts
    end
  end

  private

  def create_reminder(actor:, key:)
    with_actor(actor) do
      Clinic::Reminders::Create.call(
        practice: @practice, actor: actor, patient: @patient, endpoint_id: @endpoint.id, request_key: key,
        category: "appointment", channel: "email", scheduled_at: @at
      )
    end
  end

  def create_staff_member(email)
    user = User.create!(email_address: email, password: SecureRandom.hex(20))
    @practice.memberships.create!(user: user)
  end

  def with_actor(actor)
    PaperTrail.request(whodunnit: actor.id.to_s, controller_info: { request_id: "background-work-test" }) { yield }
  end

  def creation_actor_for(record)
    Clinic::ModelVersion.for_practice(@practice)
      .where(item_type: record.class.base_class.name, item_id: record.id, event: "create")
      .order(:id).pick(:actor_reference)
  end

  def with_environment(values)
    previous = values.to_h { |key, _value| [ key, ENV[key] ] }
    values.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
    yield
  ensure
    previous.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end
end
