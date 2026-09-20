require "test_helper"

class OwnerCommandCenterTest < ActionDispatch::IntegrationTest
  PASSWORD = "Owner-command-center-2026!".freeze

  setup do
    Rails.cache.clear
    ActionMailer::Base.deliveries.clear
    Clinic::Authorization::PilotRoleCatalog.install!
    host! "localhost:3000"
    @admin = User.create!(email_address: "platform.owner@example.invalid", password: PASSWORD,
      active: true, admin: true, platform_owner: true)
  end

  test "platform owner establishes a clinic and emails a password creation link" do
    sign_in(@admin)

    assert_difference -> { Organization.count }, 1 do
      assert_difference -> { Clinic::Practice.count }, 1 do
        assert_no_difference -> { User.count } do
          assert_difference -> { Clinic::Workforce::EmployeeInvitation.count }, 1 do
            assert_difference -> { ActionMailer::Base.deliveries.size }, 1 do
              post "/api/owner/clinics", params: clinic_params, headers: csrf_headers, as: :json
            end
          end
        end
      end
    end
    assert_response :created

    body = response.parsed_body
    practice = Clinic::Practice.find(body.dig("clinic", "id"))
    invitation = Clinic::Workforce::EmployeeInvitation.find_by!(practice:)
    message = ActionMailer::Base.deliveries.sole
    text = message.text_part.body.decoded

    assert_equal "Riverbend Health Group", practice.organization.name
    assert_equal "Riverbend Primary Care", practice.name
    assert_equal "America/Chicago", practice.timezone
    assert_predicate practice, :platform_managed?
    assert_equal "Main clinic", practice.sites.find_by!(status: "active").name
    assert_predicate invitation, :pending?
    assert_equal @admin, invitation.invited_by_platform_user
    assert_nil invitation.invited_by_membership
    assert_equal "morgan.reed@example.invalid", invitation.email_address
    assert_equal [ "morgan.reed@example.invalid" ], message.to
    assert_equal "Create your Meta Clinic password", message.subject
    assert_includes text, "http://example.com/workforce/activate#token="
    assert_no_match(/^password:/i, text)
    assert_nil body.dig("invitation", "activation_path")
    assert_equal "sent", body.dig("invitation", "delivery_status")
    assert_equal "invited", body.dig("clinic", "state")
    assert_equal [ "morgan.reed@example.invalid" ], body.dig("clinic", "owner_invitations")

    url = text[%r{http://example\.com/workforce/activate#token=\S+}]
    token = URI.decode_www_form_component(URI(url).fragment.delete_prefix("token="))
    assert_difference -> { User.count }, 1 do
      post "/api/employee_activation", params: {
        employee_activation: { token:, password: PASSWORD, password_confirmation: PASSWORD }
      }, headers: csrf_headers, as: :json
    end
    assert_response :created

    owner = User.find_by!(email_address: "morgan.reed@example.invalid")
    membership = owner.clinic_membership
    employment = Clinic::Workforce::Employment.find_by!(membership:)
    grant = membership.role_grants.active.sole
    assert_not owner.admin?
    assert_equal practice, membership.practice
    assert_equal "Morgan Reed", employment.staff_member.display_name
    assert_equal "clinic-administrator", grant.role_version.role_code
    assert_equal Clinic::Authorization::PilotRoleCatalog::VERSION, grant.role_version.version
    assert Clinic::Authorization.allowed?(actor: owner, practice:, action: "roles.manage")
    assert_predicate invitation.reload, :activated?
    assert_nil invitation.token_digest

    get "/api/owner/command_center"
    assert_response :forbidden
    get "/api/clinic"
    assert_response :success
  end

  test "command center remains aggregate-only across clinic records" do
    practice = Organization.create!(name: "Aggregate Group").practices.create!(
      name: "Aggregate Clinic", timezone: "America/Chicago", platform_managed: true
    )
    practice.sites.create!(code: "MAIN", name: "Main clinic", status: "active")
    patient = practice.patients.create!(display_name: "Synthetic Hidden Patient", reference: "AGG-PATIENT")
    sign_in(@admin)

    get "/api/owner/command_center"
    assert_response :success
    payload = response.parsed_body
    serialized = payload.to_json

    assert_includes serialized, "Aggregate Clinic"
    refute_includes serialized, patient.display_name
    refute_includes serialized, "AGG-PATIENT"
    refute_includes serialized, "patient_id"
    aggregate = payload.fetch("organizations").find { |entry| entry.fetch("name") == "Aggregate Group" }
    assert_equal 0, aggregate.fetch("clinics").sole.fetch("member_count")
  end

  test "platform owner can review registered demo usage" do
    practice = Clinic::Practice.create!(name: "Demo usage clinic", timezone: "America/Chicago")
    operator = User.create!(email_address: "demo.operator@example.invalid", password: PASSWORD)
    visitor = Development::DemoVisitor.create!(
      name: "Taylor Morgan", email: "taylor@example.invalid", company: "Northstar Wellness"
    )
    now = Time.zone.parse("2026-09-20 10:00:00")
    Development::DemoRun.create!(
      practice:, operator_user: operator, visitor:, template_key: "primary_care",
      lesson_key: "clinic_setup", active: false, completed_at: now - 5.minutes, elapsed_seconds: 180,
      created_at: now - 8.minutes, updated_at: now - 5.minutes
    )
    Development::DemoRun.create!(
      practice:, operator_user: operator, visitor:, template_key: "primary_care",
      lesson_key: "membership_publish", active: true, created_at: now - 2.minutes, updated_at: now - 2.minutes
    )

    travel_to now do
      sign_in(@admin)
      get "/api/owner/command_center"
    end

    assert_response :success
    usage = response.parsed_body.fetch("demo_usage").find { |entry| entry.fetch("id") == visitor.id }
    assert_equal "Taylor Morgan", usage.fetch("name")
    assert_equal "taylor@example.invalid", usage.fetch("email")
    assert_equal "Northstar Wellness", usage.fetch("company")
    assert_equal 2, usage.fetch("lessons_started")
    assert_equal 300, usage.fetch("elapsed_seconds")
    assert_equal [
      { "lesson_key" => "clinic_setup", "title" => "Finish clinic setup", "elapsed_seconds" => 180, "completed" => true },
      { "lesson_key" => "membership_publish", "title" => "Publish a membership", "elapsed_seconds" => 120, "completed" => false }
    ], usage.fetch("lesson_usage")
  end

  test "platform owner can add a clinic to an existing organization" do
    organization = Organization.create!(name: "North Shore Medical Group")
    sign_in(@admin)

    params = clinic_params
    params[:clinic][:organization_id] = organization.id
    params[:clinic][:organization_name] = ""
    params[:clinic][:clinic_name] = "North Shore Family Medicine"
    params[:clinic][:owner_email] = "owner@northshore.example.invalid"

    assert_no_difference -> { Organization.count } do
      post "/api/owner/clinics", params:, headers: csrf_headers, as: :json
    end
    assert_response :created
    assert_equal organization.id, Clinic::Practice.find(response.parsed_body.dig("clinic", "id")).organization_id
  end

  test "non-platform accounts cannot view or create clinics" do
    employee = User.create!(email_address: "employee@example.invalid", password: PASSWORD, admin: true)
    sign_in(employee)

    get "/api/owner/command_center"
    assert_response :forbidden
    assert_no_difference [ "Organization.count", "Clinic::Practice.count", "User.count" ] do
      post "/api/owner/clinics", params: clinic_params, headers: csrf_headers, as: :json
    end
    assert_response :forbidden
  end

  test "emailed owner invitation creates the sole platform owner and signs in" do
    @admin.destroy!

    assert_difference -> { Platform::OwnerInvitation.count }, 1 do
      assert_difference -> { ActionMailer::Base.deliveries.size }, 1 do
        Platform::IssueOwnerInvitation.call(email_address: "new.owner@example.invalid")
      end
    end

    invitation = Platform::OwnerInvitation.last
    message = ActionMailer::Base.deliveries.sole
    text = message.text_part.body.decoded
    url = text[%r{http://example\.com/owner/activate#token=\S+}]
    token = URI.decode_www_form_component(URI(url).fragment.delete_prefix("token="))

    assert_predicate invitation, :pending?
    assert_equal [ "new.owner@example.invalid" ], message.to
    assert_equal "Create your Meta Clinic owner password", message.subject
    assert_no_match(/^password:/i, text)

    assert_difference -> { User.where(platform_owner: true).count }, 1 do
      post "/api/owner_activation", params: {
        owner_activation: { token:, password: PASSWORD, password_confirmation: PASSWORD }
      }, headers: csrf_headers, as: :json
    end
    assert_response :created
    assert_equal "/owner", response.parsed_body.fetch("redirect_to")

    owner = User.find_by!(email_address: "new.owner@example.invalid")
    assert_predicate owner, :platform_owner?
    assert_predicate owner, :admin?
    assert_predicate invitation.reload, :accepted?
    assert_nil invitation.token_digest

    get "/api/owner/command_center"
    assert_response :success
    assert_raises(Platform::IssueOwnerInvitation::Unavailable) do
      Platform::IssueOwnerInvitation.call(email_address: "second.owner@example.invalid")
    end
    assert_raises(ActiveRecord::RecordNotUnique) do
      User.create!(email_address: "second.owner@example.invalid", password: PASSWORD,
        admin: true, platform_owner: true)
    end
  end

  test "owner invitation is single use and an expired invitation is revoked" do
    @admin.destroy!
    invitation = Platform::IssueOwnerInvitation.call(email_address: "expired.owner@example.invalid")
    token = token_from_last_owner_email
    invitation.update_columns(invited_at: 2.hours.ago, expires_at: 1.hour.ago)

    assert_no_difference -> { User.where(platform_owner: true).count } do
      post "/api/owner_activation", params: {
        owner_activation: { token:, password: PASSWORD, password_confirmation: PASSWORD }
      }, headers: csrf_headers, as: :json
    end
    assert_response :unprocessable_entity
    assert_predicate invitation.reload, :revoked?
    assert_nil invitation.token_digest
  end

  test "owner invitation delivery failure revokes the unusable token" do
    @admin.destroy!
    mailer = Platform::OwnerInvitationMailer.singleton_class
    original_invitation = Platform::OwnerInvitationMailer.method(:invitation)
    mailer.define_method(:invitation) { |*| raise Errno::ECONNREFUSED }

    begin
      assert_raises(Platform::IssueOwnerInvitation::DeliveryFailed) do
        Platform::IssueOwnerInvitation.call(email_address: "owner@example.invalid")
      end
    ensure
      mailer.define_method(:invitation, original_invitation)
    end

    invitation = Platform::OwnerInvitation.last
    assert_predicate invitation, :revoked?
    assert_nil invitation.token_digest
    assert_equal "failed", PlatformAuditEvent.last.outcome
  end

  test "pending owner email leaves no partial duplicate clinic" do
    sign_in(@admin)
    post "/api/owner/clinics", params: clinic_params, headers: csrf_headers, as: :json
    assert_response :created

    assert_no_difference [ "Organization.count", "Clinic::Practice.count", "Clinic::Site.count" ] do
      params = clinic_params
      params[:clinic][:organization_name] = "Another Organization"
      params[:clinic][:clinic_name] = "Another Clinic"
      post "/api/owner/clinics", params:, headers: csrf_headers, as: :json
    end
    assert_response :unprocessable_entity
    assert_equal "A pending clinic invitation already uses that email address.", response.parsed_body.fetch("error")
  end

  test "email delivery failure preserves a recoverable invitation link" do
    sign_in(@admin)
    mailer = Platform::ClinicOwnerMailer.singleton_class
    original_invitation = Platform::ClinicOwnerMailer.method(:invitation)
    mailer.define_method(:invitation) { |*| raise Errno::ECONNREFUSED }

    begin
      assert_difference -> { Clinic::Practice.count }, 1 do
        post "/api/owner/clinics", params: clinic_params, headers: csrf_headers, as: :json
      end
    ensure
      mailer.define_method(:invitation, original_invitation)
    end
    assert_response :created
    assert_equal "failed", response.parsed_body.dig("invitation", "delivery_status")
    assert_match(%r{\A/workforce/activate#token=}, response.parsed_body.dig("invitation", "activation_path"))
    assert_predicate Clinic::Workforce::EmployeeInvitation.last, :pending?
  end

  test "platform owner can invite an owner for an existing clinic" do
    practice = Organization.create!(name: "Existing Group").practices.create!(
      name: "Existing Clinic", timezone: "America/Chicago", platform_managed: true
    )
    practice.sites.create!(code: "MAIN", name: "Main clinic", status: "active")
    sign_in(@admin)

    assert_difference -> { Clinic::Workforce::EmployeeInvitation.count }, 1 do
      post "/api/owner/clinics/#{practice.id}/owner_invitation", params: {
        owner: { name: "Robin Garison", email: "r_garison25@yahoo.com" }
      }, headers: csrf_headers, as: :json
    end

    assert_response :created
    assert_equal "invited", response.parsed_body.dig("clinic", "state")
    assert_equal "sent", response.parsed_body.dig("invitation", "delivery_status")
    assert_equal [ "r_garison25@yahoo.com" ], ActionMailer::Base.deliveries.last.to
  end

  test "platform owner can text an owner activation link" do
    practice = Organization.create!(name: "Text Group").practices.create!(
      name: "Text Clinic", timezone: "America/Chicago", platform_managed: true
    )
    practice.sites.create!(code: "MAIN", name: "Main clinic", status: "active")
    sign_in(@admin)
    sms = Platform::ClinicOwnerInvitationSms.singleton_class
    original_deliver = Platform::ClinicOwnerInvitationSms.method(:deliver)
    captured = nil
    sms.define_method(:deliver) { |**args| captured = args; true }

    begin
      assert_no_difference -> { ActionMailer::Base.deliveries.size } do
        post "/api/owner/clinics/#{practice.id}/owner_invitation", params: {
          owner: { name: "Robin Garison", email: "robin@example.invalid", delivery_method: "sms", phone: "(555) 555-1212" }
        }, headers: csrf_headers, as: :json
      end
    ensure
      sms.define_method(:deliver, original_deliver)
    end

    assert_response :created
    assert_equal "sent", response.parsed_body.dig("invitation", "delivery_status")
    assert_nil response.parsed_body.dig("invitation", "activation_path")
    assert_equal "+15555551212", captured.fetch(:phone_number).then { |number| Platform::ClinicOwnerInvitationSms.normalize_phone(number) }
    assert_match(%r{\A/workforce/activate#token=}, captured.fetch(:activation_path))
  end

  test "resending replaces the previous pending owner link" do
    practice = Organization.create!(name: "Resend Group").practices.create!(
      name: "Resend Clinic", timezone: "America/Chicago", platform_managed: true
    )
    practice.sites.create!(code: "MAIN", name: "Main clinic", status: "active")
    sign_in(@admin)
    params = { owner: { name: "Robin Garison", email: "robin@example.invalid" } }

    post "/api/owner/clinics/#{practice.id}/owner_invitation", params:, headers: csrf_headers, as: :json
    assert_response :created
    original = practice.workforce_employee_invitations.pending.sole
    original_digest = original.token_digest
    post "/api/owner/clinics/#{practice.id}/owner_invitation", params:, headers: csrf_headers, as: :json

    assert_response :created
    assert_predicate original.reload, :pending?
    refute_equal original_digest, original.token_digest
    assert_equal 1, practice.workforce_employee_invitations.pending.count
    assert_equal 2, ActionMailer::Base.deliveries.size
  end

  private

  def clinic_params
    {
      clinic: {
        organization_id: "",
        organization_name: "Riverbend Health Group",
        clinic_name: "Riverbend Primary Care",
        timezone: "America/Chicago",
        owner_name: "Morgan Reed",
        owner_email: "morgan.reed@example.invalid"
      }
    }
  end

  def sign_in(user, password: PASSWORD)
    post "/api/session", params: { email_address: user.email_address, password: },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf"
    { "X-CSRF-Token" => response.parsed_body.fetch("csrf_token"),
      "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
  end

  def token_from_last_owner_email
    text = ActionMailer::Base.deliveries.last.text_part.body.decoded
    url = text[%r{http://example\.com/owner/activate#token=\S+}]
    URI.decode_www_form_component(URI(url).fragment.delete_prefix("token="))
  end
end
