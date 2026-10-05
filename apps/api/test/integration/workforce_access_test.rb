require "test_helper"

class WorkforceAccessTest < ActionDispatch::IntegrationTest
  PASSWORD = "Workforce-access-only-2026!".freeze

  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }

    @practice = Clinic::Practice.create!(name: "Workforce Access Clinic", timezone: "UTC")
    @assigned_site = @practice.sites.create!(code: "MAIN", name: "Main clinic", status: "active")
    @other_site = @practice.sites.create!(code: "NORTH", name: "North clinic", status: "active")

    @employee = create_user("workforce-employee")
    @employee_membership = @practice.memberships.create!(user: @employee)
    RoleVersion.find_or_create_by!(role_code: "workforce-employee", version: 1)
    @employee_directory = @practice.staff_members.create!(display_name: "Taylor Morgan",
      job_title: "Clinic coordinator", active: true)
    @employment = Clinic::Workforce::Employment.create!(practice: @practice,
      staff_member: @employee_directory, membership: @employee_membership,
      status: "active", effective_from: 1.hour.ago)
    @employment.employment_sites.create!(practice: @practice, site: @assigned_site,
      active: true, effective_from: 1.hour.ago)

    @manager = create_user("workforce-manager")
    @manager_membership = @practice.memberships.create!(user: @manager)
    grant_permissions!(@manager_membership, "roles.manage", "workforce.admin", "workforce.settings",
      "workforce.payroll.configure", "workforce.payroll.export")

    @foreign_practice = Clinic::Practice.create!(name: "Foreign Workforce Clinic", timezone: "UTC")
    @foreign_site = @foreign_practice.sites.create!(code: "FOREIGN", name: "Foreign clinic", status: "active")
    @foreign_user = create_user("foreign-workforce-employee")
    @foreign_membership = @foreign_practice.memberships.create!(user: @foreign_user)
    @foreign_directory = @foreign_practice.staff_members.create!(display_name: "Morgan Lee",
      job_title: "Foreign coordinator", active: true)
    @foreign_employment = Clinic::Workforce::Employment.create!(practice: @foreign_practice,
      staff_member: @foreign_directory, membership: @foreign_membership,
      status: "active", effective_from: 1.hour.ago)
    @foreign_employment.employment_sites.create!(practice: @foreign_practice, site: @foreign_site,
      active: true, effective_from: 1.hour.ago)
  end

  test "employee access update rejects a missing review revision without mutations" do
    login(@manager)
    patch "/api/clinic/workforce/employments/#{@employment.id}",
      params: { employment: { status: "inactive" } }, headers: csrf_headers, as: :json

    assert_response :bad_request
    assert_equal "expected_access_revision", response.parsed_body.fetch("field")
    assert @employment.reload.active?
    assert @employee_membership.reload.active?
  end

  test "employee access update rejects a stale reviewed revision then accepts a fresh revision" do
    login(@manager)
    get "/api/clinic/workforce/employments", headers: @headers
    assert_response :success
    reviewed = response.parsed_body.fetch("employments").find { |record| record.fetch("id") == @employment.id }
    assert_match(/\A[a-f0-9]{64}\z/, reviewed.fetch("access_revision"))

    @employee_membership.advance_authorization_generation!
    patch "/api/clinic/workforce/employments/#{@employment.id}",
      params: { employment: { status: "inactive", expected_access_revision: reviewed.fetch("access_revision") } },
      headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "stale_record", response.parsed_body.fetch("code")
    assert @employment.reload.active?
    assert_equal [ @assigned_site.id ], @employment.employment_sites.active.pluck(:site_id)

    get "/api/clinic/workforce/employments", headers: @headers
    fresh = response.parsed_body.fetch("employments").find { |record| record.fetch("id") == @employment.id }
    patch "/api/clinic/workforce/employments/#{@employment.id}",
      params: { employment: { status: "inactive", expected_access_revision: fresh.fetch("access_revision") } },
      headers: csrf_headers, as: :json
    assert_response :success
    assert @employment.reload.inactive?
  end

  test "employee context exposes only assigned sites and no clinical permissions" do
    login(@employee)

    get "/api/clinic/context", headers: @headers

    assert_response :success
    assert_equal [ @assigned_site.id ], response.parsed_body.fetch("sites").pluck("id")
    capabilities = response.parsed_body.fetch("capabilities")
    assert_equal true, capabilities.fetch("workforce_self")
    %w[
      patients patient_identity_read patients_write appointments appointments_read appointments_book
      encounters notes_read notes_write documents messages billing billing_read roles
    ].each do |permission|
      assert_equal false, capabilities.fetch(permission), "#{permission} must not follow from employment"
    end
  end

  test "practice workforce manager receives all practice sites without clinical authority" do
    login(@manager)

    get "/api/clinic/context", headers: @headers

    assert_response :success
    assert_equal [ @assigned_site.id, @other_site.id ].sort,
      response.parsed_body.fetch("sites").pluck("id").sort
    capabilities = response.parsed_body.fetch("capabilities")
    assert_equal true, capabilities.fetch("workforce_admin")
    assert_equal true, capabilities.fetch("workforce_settings")
    assert_equal true, capabilities.fetch("workforce_payroll_configure")
    assert_equal false, capabilities.fetch("patients")
    assert_equal false, capabilities.fetch("billing_read")
  end

  test "publisher-only schedule validation is limited to its granted site" do
    publisher = create_user("schedule-publisher")
    publisher_membership = @practice.memberships.create!(user: publisher)
    grant_permissions!(publisher_membership, "workforce.schedule.publish", scope_kind: "site", site: @assigned_site)
    assigned_draft = Clinic::Workforce::ScheduleDraft.create!(practice: @practice, site: @assigned_site,
      created_by_id: @manager.id, week_start_on: Date.current.beginning_of_week, timezone: "UTC", status: "draft", revision: 1)
    other_draft = Clinic::Workforce::ScheduleDraft.create!(practice: @practice, site: @other_site,
      created_by_id: @manager.id, week_start_on: Date.current.beginning_of_week, timezone: "UTC", status: "draft", revision: 1)
    login(publisher)

    post "/api/clinic/workforce/schedule-drafts/#{assigned_draft.id}/validate", headers: csrf_headers, as: :json
    assert_response :success
    assert_equal assigned_draft.id.to_s, response.parsed_body.dig("draft", "id")

    post "/api/clinic/workforce/schedule-drafts/#{other_draft.id}/validate", headers: csrf_headers, as: :json
    assert_response :forbidden
  end

  test "HEAD workforce reads use the same protected audit classification as GET" do
    login(@manager)
    before = Clinic::AuditEvent.maximum(:id) || 0

    head "/api/clinic/workforce/employments", headers: @headers

    assert_response :success
    event = Clinic::AuditEvent.where(practice: @practice, action_code: "workforce.admin", outcome: "released")
      .where("id > ?", before).order(:id).last
    assert event
  end

  test "employee location selection persists only within assigned sites" do
    @employment.employment_sites.create!(practice: @practice, site: @other_site,
      active: true, effective_from: 1.hour.ago)
    login(@employee)
    patch "/api/clinic/context", params: { site_id: @other_site.id }, headers: csrf_headers, as: :json
    assert_response :success
    get "/api/clinic/context", headers: @headers
    assert_equal @other_site.id, response.parsed_body.dig("current_site", "id")
    patch "/api/clinic/context", params: { site_id: @foreign_site.id }, headers: csrf_headers, as: :json
    assert_response :not_found
    get "/api/session", headers: @headers
    assert_response :success
    assert_equal @employee.id, response.parsed_body.dig("user", "id")
    get "/api/clinic/context", headers: @headers
    assert_response :success
    assert_equal @other_site.id, response.parsed_body.dig("current_site", "id")
  end

  test "preloaded employment sites preserve eligibility without per-site queries" do
    @employment.employment_sites.load
    queries = []
    subscriber = ->(_name, _started, _finished, _unique_id, payload) { queries << payload[:sql].to_s }

    ActiveRecord::Base.uncached do
      ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") do
        assert @employment.eligible_site?(@assigned_site)
        refute @employment.eligible_site?(@other_site)
      end
    end

    refute queries.any? { |sql| sql.match?(/FROM "clinic_workforce_employment_sites"/i) }, queries.join("\n")
  end

  test "tenant ID tampering cannot cross employment settings or payroll boundaries" do
    login(@manager)

    get "/api/clinic/workforce/employments", params: { practice_id: @foreign_practice.id }, headers: @headers
    assert_response :success
    returned_ids = response.parsed_body.fetch("employments").pluck("id")
    assert_not_includes returned_ids, @foreign_employment.id

    post "/api/clinic/workforce/employments", params: {
      employment: {
        staff_member_id: @foreign_directory.id,
        membership_id: @foreign_membership.id,
        site_ids: [ @foreign_site.id ],
        effective_from: Time.current.iso8601
      }
    }, headers: csrf_headers, as: :json
    assert_response :not_found

    get "/api/clinic/workforce/settings", params: { site_id: @foreign_site.id }, headers: @headers
    assert_response :not_found
    put "/api/clinic/workforce/settings", params: {
      workforce_settings: {
        scope_kind: "site",
        site_id: @foreign_site.id,
        effective_from: Time.current.iso8601,
        expected_revision: 0,
        values: { kiosk_enabled: false }
      }
    }, headers: csrf_headers, as: :json
    assert_response :not_found

    get "/api/clinic/workforce/payroll-exports", params: { site_id: @foreign_site.id }, headers: @headers
    assert_response :not_found
  end

  test "employee administration creates the directory record employment and role together" do
    employee_role = RoleVersion.find_or_create_by!(role_code: "workforce-employee", version: 1)
    linked_user = create_user("linked-workforce-employee")
    linked_membership = @practice.memberships.create!(user: linked_user)
    login(@manager)

    assert_difference("Clinic::Staff::Member.count", 1) do
      assert_difference("Clinic::Workforce::Employment.count", 1) do
        assert_difference("Clinic::RoleGrant.count", 1) do
          post "/api/clinic/workforce/employments", params: {
            employment: {
              display_name: "Morgan Reed",
              job_title: "Medical assistant",
              membership_id: linked_membership.id,
              role_version_id: employee_role.id,
              site_ids: [ @assigned_site.id ],
              effective_from: Time.current.iso8601
            }
          }, headers: csrf_headers, as: :json
          assert_response :created
        end
      end
    end

    employment = Clinic::Workforce::Employment.find(response.parsed_body.dig("employment", "id"))
    assert_equal "Morgan Reed", employment.staff_member.display_name
    assert_equal linked_membership.id, employment.membership_id
    assert_equal [ "workforce-employee" ],
      employment.membership.role_grants.active.includes(:role_version).map { |grant| grant.role_version.role_code }
  end

  test "employment administration batches serializer role and site associations" do
    4.times do |index|
      user = create_user("serialized-workforce-#{index}")
      membership = @practice.memberships.create!(user: user)
      staff = @practice.staff_members.create!(display_name: "Serialized workforce #{index}",
        job_title: "Coordinator", active: true)
      employment = Clinic::Workforce::Employment.create!(practice: @practice, staff_member: staff,
        membership: membership, status: "active", effective_from: 1.hour.ago)
      employment.employment_sites.create!(practice: @practice, site: @assigned_site,
        active: true, effective_from: 1.hour.ago)
    end
    login(@manager)
    association_queries = []
    subscriber = ->(_name, _started, _finished, _unique_id, payload) { association_queries << payload[:sql].to_s }

    ActiveRecord::Base.uncached do
      ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") do
        get "/api/clinic/workforce/employments", headers: @headers
      end
    end

    assert_response :success
    assert_equal 5, response.parsed_body.fetch("employments").length
    assert_operator association_queries.count { |sql| sql.match?(/FROM "clinic_role_grants"/i) }, :<=, 2,
      association_queries.join("\n")
  end

  test "inactive employment removes workforce self-service without changing host identity" do
    login(@employee)
    get "/api/clinic/context", headers: @headers
    assert_equal true, response.parsed_body.dig("capabilities", "workforce_self")

    @employment.update!(status: "inactive")
    get "/api/clinic/context", headers: @headers

    assert_response :success
    assert_equal false, response.parsed_body.dig("capabilities", "workforce_self")
    assert @employee.reload.active?
    assert @employee_membership.reload.active?
    get "/api/session", headers: @headers
    assert_response :success
    assert_equal @employee.id, response.parsed_body.dig("user", "id")
  end

  test "site participant eligibility requires both messaging access and an active work assignment" do
    grant_permissions!(@manager_membership, "staff_messaging.read")
    grant_permissions!(@employee_membership, "staff_messaging.read")
    unassigned_user = create_user("unassigned-messaging-recipient")
    unassigned_membership = @practice.memberships.create!(user: unassigned_user)
    grant_permissions!(unassigned_membership, "staff_messaging.read")
    ability = Ability.new(@manager, practice: @practice)

    participant_ids = Clinic::Messaging::ParticipantIndex.call(
      practice: @practice, ability: ability, site: @assigned_site
    ).map(&:id)

    assert_includes participant_ids, @employee_membership.id
    assert_not_includes participant_ids, unassigned_membership.id

    @employment.update!(status: "inactive", effective_until: Time.current)

    participant_ids = Clinic::Messaging::ParticipantIndex.call(
      practice: @practice, ability: ability, site: @assigned_site
    ).map(&:id)
    assert_not_includes participant_ids, @employee_membership.id
  end

  test "employee activation requires CSRF and remains blocked by the production release gate" do
    invited_staff = @practice.staff_members.create!(display_name: "Alex Rivera",
      job_title: "Medical assistant", active: true)
    invitation = Clinic::Workforce::EmployeeOnboarding.invite!(practice: @practice,
      staff_member: invited_staff, email_address: "invited-#{SecureRandom.hex(6)}@example.invalid",
      site_ids: [ @assigned_site.id ], effective_from: Time.current, actor: @manager)
    payload = {
      employee_activation: {
        token: invitation.fetch(:token),
        password: "New-workforce-account-2026!",
        password_confirmation: "New-workforce-account-2026!"
      }
    }

    post "/api/employee_activation", params: payload, as: :json
    assert_response :unprocessable_entity
    assert invitation.fetch(:invitation).reload.pending?

    deployed("staging") do
      post "/api/employee_activation", params: payload, headers: csrf_headers, as: :json
      assert_response :not_found

      ENV["APP_CLINIC_PILOT_PRACTICE_IDS"] = @practice.id.to_s
      post "/api/employee_activation", params: payload, headers: csrf_headers, as: :json
      assert_response :created
    end
    assert invitation.fetch(:invitation).reload.activated?
    assert User.exists?(email_address: invitation.fetch(:invitation).email_address)
  end

  test "account revocation closes sessions and restore requires a fresh role grant" do
    role = Clinic::Authorization::PilotRoleCatalog.current_versions.find { |candidate| candidate.role_code == "workforce-employee" }
    login(@employee)
    assert MemberSession.exists?(user_id: @employee.id)
    original_generation = @employee_membership.authorization_generation

    Clinic::Workforce::EmployeeAccessLifecycle.revoke!(employment: @employment, actor: @manager)

    assert_not @employee.reload.active?
    assert_not @employee_membership.reload.active?
    assert @employment.reload.inactive?
    assert_not MemberSession.exists?(user_id: @employee.id)
    assert_operator @employee_membership.authorization_generation, :>, original_generation

    Clinic::Workforce::EmployeeAccessLifecycle.restore!(employment: @employment, actor: @manager,
      role_version: role, sites: [ @assigned_site ])

    assert @employee.reload.active?
    assert @employee_membership.reload.active?
    assert @employment.reload.active?
    assert @employee_membership.role_grants.active.where(source_employment_id: @employment.id).exists?
  end

  test "Muse214 onboarding returns creation token once and stores only its digest" do
    assert_equal false, Clinic::Configuration::PracticeFeatures.snapshot(practice: @practice, site: @assigned_site)[:finalized]
    login(@manager)
    post "/api/clinic/workforce/onboarding", params: muse_invitation_payload,
      headers: csrf_headers, as: :json
    assert_response :created
    created = response.parsed_body.fetch("invitation")
    token = created.fetch("activation_token_once")
    assert token.present?, "Creation must provide a one-time token"
    assert created.fetch("activation_path") == "/workforce/activate#token=#{ERB::Util.url_encode(token)}",
      "Creation link must carry the token in its fragment"
    invitation = Clinic::Workforce::EmployeeInvitation.find(created.fetch("id"))
    assert_equal Digest::SHA256.hexdigest(token), invitation.token_digest
    assert invitation.attributes.values.none? { |value| value == token }, "Raw token must not be persisted"

    get "/api/clinic/workforce/employments", headers: @headers
    assert_response :success
    pending = response.parsed_body.fetch("invitations").find { |item| item.fetch("id") == invitation.id }
    assert pending
    assert_equal %w[display_name email_address expires_at id role_code staff_member_id], pending.keys.sort
    assert !response.body.include?(token), "Pending index must not recover the creation token"
    assert_equal Digest::SHA256.hexdigest(token), invitation.reload.token_digest
    patch "/api/clinic/workforce/onboarding/#{invitation.id}",
      params: { employee_invitation: { action: "revoke" } }, headers: csrf_headers, as: :json
    assert_response :success
    assert invitation.reload.revoked?
    assert_nil invitation.token_digest
    post "/api/clinic/workforce/onboarding", params: muse_invitation_payload,
      headers: csrf_headers, as: :json
    assert_response :created
    replacement = response.parsed_body.fetch("invitation")
    replacement_token = replacement.fetch("activation_token_once")
    assert_not_equal token, replacement_token
    assert_equal Digest::SHA256.hexdigest(replacement_token),
      Clinic::Workforce::EmployeeInvitation.find(replacement.fetch("id")).token_digest
  end

  test "Muse58 stale practice onboarding is rejected after session context switches without domain writes" do
    other_membership = @foreign_practice.memberships.create!(user: @manager)
    grant_permissions!(other_membership, "roles.manage", "workforce.admin")
    login(@manager)
    stale_headers = csrf_headers.merge("X-Clinic-Practice" => @practice.id.to_s)
    patch "/api/clinic/context", params: { practice_id: @foreign_practice.id },
      headers: stale_headers, as: :json
    assert_response :success
    assert_equal @foreign_practice.id, response.parsed_body.fetch("practice_id")

    counts = -> { [ Clinic::Workforce::EmployeeInvitation.count, Clinic::Staff::Member.count,
      Clinic::Workforce::Employment.count, Clinic::RoleGrant.count ] }
    before = counts.call
    post "/api/clinic/workforce/onboarding", params: muse_invitation_payload,
      headers: stale_headers, as: :json
    assert_response :conflict
    assert_equal "clinic_changed", response.parsed_body.fetch("code")
    assert_equal before, counts.call
    get "/api/clinic/context", headers: @headers
    assert_response :success
    assert_equal @foreign_practice.id, response.parsed_body.fetch("practice").fetch("id")
    assert_equal before, counts.call
  end

  test "Muse21 and Muse44 participant endpoint filters site employment and messaging access" do
    grant_permissions!(@manager_membership, "staff_messaging.read")
    grant_permissions!(@employee_membership, "staff_messaging.read", scope_kind: "site", site: @assigned_site)
    grant_permissions!(@foreign_membership, "staff_messaging.read")
    unassigned = @practice.memberships.create!(user: create_user("muse-unassigned"))
    grant_permissions!(unassigned, "staff_messaging.read")
    login(@manager)

    get "/api/clinic/staff-messaging/participants", params: { site_id: @assigned_site.id }, headers: @headers
    assert_response :success
    assert_equal [ @employee_membership.id ], response.parsed_body.fetch("participants").pluck("id")
    get "/api/clinic/staff-messaging/participants", params: { site_id: @other_site.id }, headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("participants")

    set_permission!(@employee_membership, "staff_messaging.read", false)
    get "/api/clinic/staff-messaging/participants", params: { site_id: @assigned_site.id }, headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("participants")
  end

  test "Muse112 authorized creator without employment can create and denied creation writes nothing" do
    grant_permissions!(@manager_membership, "staff_messaging.read", "staff_messaging.create_conversation")
    grant_permissions!(@employee_membership, "staff_messaging.read", scope_kind: "site", site: @assigned_site)
    assert_nil Clinic::Workforce::Employment.find_by(membership: @manager_membership)
    login(@manager)
    payload = { conversation: { request_key: "muse-authorized-#{SecureRandom.hex(6)}", kind: "team",
      title: "Synthetic Muse conversation", site_id: @assigned_site.id, member_ids: [ @employee_membership.id ] } }
    post "/api/clinic/staff-messaging/conversations", params: payload, headers: csrf_headers, as: :json
    assert_response :created
    conversation = Clinic::StaffConversation.find(response.parsed_body.fetch("conversation").fetch("id"))
    assert_equal [ @manager_membership.id, @employee_membership.id ].sort,
      conversation.members.active.pluck(:membership_id).sort

    set_permission!(@manager_membership, "staff_messaging.create_conversation", false)
    payload[:conversation][:request_key] = "muse-denied-#{SecureRandom.hex(6)}"
    counts = -> { [ Clinic::StaffConversation.count, Clinic::StaffConversationMember.count, Clinic::StaffMessage.count ] }
    before = counts.call
    post "/api/clinic/staff-messaging/conversations", params: payload, headers: csrf_headers, as: :json
    assert_response :forbidden
    assert_equal before, counts.call
  end

  private

  def muse_invitation_payload
    { employee_invitation: { display_name: "Synthetic Muse Invite", job_title: "Synthetic coordinator",
      email_address: "muse-invite-#{SecureRandom.hex(6)}@example.invalid",
      site_ids: [ @assigned_site.id ], effective_from: Time.current.iso8601 } }
  end

  def create_user(label)
    User.create!(email_address: "#{label}-#{SecureRandom.hex(5)}@example.invalid",
      password: PASSWORD, active: true)
  end

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: PASSWORD },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def deployed(environment)
    previous = [ Rails.env, ENV["APP_DEPLOYMENT_ENV"], ENV["APP_DEVELOPMENT_LOGIN"], ENV["APP_CLINIC_PILOT_PRACTICE_IDS"] ]
    Rails.env = "production"
    ENV["APP_DEPLOYMENT_ENV"] = environment
    ENV["APP_DEVELOPMENT_LOGIN"] = "1"
    yield
  ensure
    Rails.env, ENV["APP_DEPLOYMENT_ENV"], ENV["APP_DEVELOPMENT_LOGIN"], ENV["APP_CLINIC_PILOT_PRACTICE_IDS"] = previous
  end
end
