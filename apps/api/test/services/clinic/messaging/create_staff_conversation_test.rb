require "test_helper"

class CreateStaffConversationTest < ActiveSupport::TestCase
  setup do
    @at = Time.utc(2026, 9, 28, 16)
    travel_to @at
    organization = Organization.create!(name: "Staff messaging test organization")
    @practice = Clinic::Practice.create!(
      name: "Staff messaging test practice", organization: organization, timezone: "UTC"
    )
    @site = @practice.sites.create!(code: "MESSAGING")
    @creator = User.create!(email_address: "messaging-creator@example.invalid", password: SecureRandom.hex(20))
    @creator_membership = @practice.memberships.create!(user: @creator)
    grant_permissions!(@creator_membership, "staff_messaging.create_conversation", "staff_messaging.read",
      scope_kind: "site", site: @site)
  end

  test "allows an authorized creator without employment and requires eligible invited recipients" do
    assert_nil Clinic::Workforce::Employment.find_by(membership: @creator_membership)
    eligible = recipient("messaging-eligible@example.invalid", read: true, employed: true)

    conversation = Clinic::Messaging::CreateStaffConversation.call(
      practice: @practice, actor: @creator, request_key: "messaging-create-eligible",
      kind: "team", title: "Synthetic team", site_id: @site.id, member_ids: [ eligible.id ]
    )

    assert_equal [ @creator_membership.id, eligible.id ].sort, conversation.members.active.pluck(:membership_id).sort

    missing_employment = recipient("messaging-unassigned@example.invalid", read: true, employed: false)
    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Messaging::CreateStaffConversation.call(
        practice: @practice, actor: @creator, request_key: "messaging-create-unassigned",
        kind: "team", title: "Synthetic team", site_id: @site.id, member_ids: [ missing_employment.id ]
      )
    end

    missing_read_access = recipient("messaging-no-read@example.invalid", read: false, employed: true)
    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Messaging::CreateStaffConversation.call(
        practice: @practice, actor: @creator, request_key: "messaging-create-no-read",
        kind: "team", title: "Synthetic team", site_id: @site.id, member_ids: [ missing_read_access.id ]
      )
    end
  end

  private

  def recipient(email, read:, employed:)
    user = User.create!(email_address: email, password: SecureRandom.hex(20))
    membership = @practice.memberships.create!(user: user)
    grant_permissions!(membership, "staff_messaging.read", scope_kind: "site", site: @site) if read
    return membership unless employed

    staff_member = @practice.staff_members.create!(display_name: "Synthetic messaging recipient",
      job_title: "Clinic coordinator", active: true)
    employment = Clinic::Workforce::Employment.create!(practice: @practice,
      staff_member: staff_member, membership: membership, status: "active", effective_from: @at - 1.day)
    employment.employment_sites.create!(practice: @practice, site: @site,
      active: true, effective_from: @at - 1.day)
    membership
  end
end
