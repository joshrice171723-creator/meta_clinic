require "test_helper"

class PatientPortalLifecycleTest < ActiveSupport::TestCase
  setup do
    @now = Time.current.change(usec: 0)
    @actor = User.create!(email_address: "portal-lifecycle-actor@example.invalid", password: SecureRandom.hex(20))
    @practice = Clinic::Practice.create!(name: "Synthetic Lifecycle Practice", timezone: "UTC")
    @other_practice = Clinic::Practice.create!(name: "Synthetic Other Lifecycle Practice", timezone: "UTC")
    @patient = @practice.patients.create!(display_name: "Synthetic Lifecycle Patient", reference: "LIFE-001")
    @other_patient = @other_practice.patients.create!(display_name: "Synthetic Other Patient", reference: "LIFE-002")
    @patient_user = User.create!(email_address: "synthetic-patient@example.invalid", password: SecureRandom.hex(20))
    @other_user = User.create!(email_address: "other-lifecycle-patient@example.invalid", password: SecureRandom.hex(20))
  end

  test "invitation requires exact terms, expires, and cannot be replayed" do
    invitation = invite_identity
    identity = invitation.fetch(:identity)
    token = invitation.fetch(:token)

    assert_match(/\A\h{64}\z/, identity.invitation_digest)
    assert_not_equal token, identity.invitation_digest
    assert identity.invitation_expires_at > @now

    assert_raises(Clinic::PatientPortal::ActivateIdentity::InvalidInvitation) do
      activate(token, accepted_terms: false, terms_version: Clinic::PatientPortal::Identity::TERMS_VERSION)
    end
    assert_raises(Clinic::PatientPortal::ActivateIdentity::InvalidInvitation) do
      activate(token, accepted_terms: true, terms_version: "patient-portal-terms-other")
    end
    assert identity.reload.invited?

    assert_raises(Clinic::PatientPortal::ActivateIdentity::InvalidInvitation) do
      activate(token, now: identity.invitation_expires_at + 1.second)
    end
    assert identity.reload.invited?

    activated = activate(token)
    assert activated.active?
    assert_equal Clinic::PatientPortal::Identity::TERMS_VERSION, activated.accepted_terms_version
    assert_equal @now, activated.accepted_terms_at
    assert_nil activated.invitation_digest
    assert_nil activated.invitation_expires_at
    assert_equal activated.id, @session.fetch(:patient_portal_identity_id)

    assert_raises(Clinic::PatientPortal::ActivateIdentity::InvalidInvitation) do
      activate(token, now: @now + 2.minutes)
    end
  end

  test "invitation rejects a patient assigned to another practice" do
    assert_raises(ActiveRecord::RecordInvalid) do
      invite_identity(practice: @practice, patient: @other_patient, user: @patient_user)
    end
    assert_not Clinic::PatientPortal::Identity.exists?(user_id: @patient_user.id)
    assert_not @practice.audit_events.exists?(action_code: "patient_portal.identity.invite")

    assert_raises(ActiveRecord::RecordInvalid) do
      invite_identity(practice: @other_practice, patient: @patient, user: @other_user)
    end
    assert_not Clinic::PatientPortal::Identity.exists?(user_id: @other_user.id)
    assert_not @other_practice.audit_events.exists?(action_code: "patient_portal.identity.invite")
  end

  test "production activation requires the identity practice to be explicitly enabled" do
    invitation = invite_identity

    deployed do
      assert_raises(Clinic::PatientPortal::ActivateIdentity::InvalidInvitation) do
        activate(invitation.fetch(:token))
      end
      assert invitation.fetch(:identity).reload.invited?

      ENV["APP_CLINIC_PILOT_PRACTICE_IDS"] = @practice.id.to_s
      assert activate(invitation.fetch(:token)).active?
    end
  end

  test "email invitation provisions an inactive account and activation establishes reusable credentials" do
    email = "portal-provisioned-#{SecureRandom.hex(6)}@example.invalid"
    invitation = Clinic::PatientPortal::InviteIdentity.call(
      practice: @practice, patient: @patient, email_address: email, actor: @actor, now: @now
    )
    user = invitation.fetch(:identity).user

    assert_not user.active?
    assert_not user.authenticate(PORTAL_PASSWORD)

    activated = activate(invitation.fetch(:token))

    assert activated.active?
    assert user.reload.active?
    assert user.authenticate(PORTAL_PASSWORD)
    assert_equal user.id, MemberSession.find(@session.fetch(:member_session_id)).user_id
  end

  test "email invitation cannot claim an unrelated account or cross-patient identity" do
    assert_raises(ArgumentError) do
      Clinic::PatientPortal::InviteIdentity.call(
        practice: @practice, patient: @patient, email_address: @actor.email_address, actor: @actor, now: @now
      )
    end

    email = "portal-bound-#{SecureRandom.hex(6)}@example.invalid"
    Clinic::PatientPortal::InviteIdentity.call(
      practice: @practice, patient: @patient, email_address: email, actor: @actor, now: @now
    )
    assert_raises(ArgumentError) do
      Clinic::PatientPortal::InviteIdentity.call(
        practice: @other_practice, patient: @other_patient, email_address: email, actor: @actor, now: @now
      )
    end
  end

  test "invalid password rolls back account and invitation activation" do
    invitation = invite_identity

    assert_raises(Clinic::PatientPortal::ActivateIdentity::InvalidPassword) do
      activate(invitation.fetch(:token), password: PORTAL_PASSWORD, password_confirmation: "different-password-2026")
    end

    assert invitation.fetch(:identity).reload.invited?
    assert_nil @session&.fetch(:member_session_id, nil)
  end

  test "audit failure preserves activation state credentials and prior browser session" do
    original_password = "Original-patient-password-2026!"
    @patient_user.update!(password: original_password)
    invitation = invite_identity
    prior_session = @patient_user.member_sessions.create!(expires_at: @now + MemberSession::MAX_DURATION)
    @session = { member_session_id: prior_session.id, patient_portal_identity_id: "prior-portal-reference" }

    unavailable_audit = Class.new do
      def self.record!(**)
        raise Clinic::AuditRecorder::Unavailable
      end
    end
    assert_raises(Clinic::AuditRecorder::Unavailable) do
      activate(invitation.fetch(:token), audit_recorder: unavailable_audit)
    end

    assert invitation.fetch(:identity).reload.invited?
    assert MemberSession.exists?(prior_session.id)
    assert_equal prior_session.id, @session.fetch(:member_session_id)
    assert_equal "prior-portal-reference", @session.fetch(:patient_portal_identity_id)
    assert @patient_user.reload.authenticate(original_password)
    assert_not @patient_user.authenticate(PORTAL_PASSWORD)
  end

  test "active patient recovery preserves access until redemption then rotates credentials and sessions" do
    invitation = invite_identity
    identity = activate(invitation.fetch(:token))
    original_session_id = @session.fetch(:member_session_id)
    original_password = PORTAL_PASSWORD
    recovery_password = "Recovered-patient-password-2026!"

    recovery = Clinic::PatientPortal::InviteIdentity.call(
      practice: @practice, patient: @patient, email_address: @patient_user.email_address,
      actor: @actor, now: @now + 1.minute
    )

    assert_equal "recovery", recovery.fetch(:purpose)
    assert identity.reload.active?
    assert MemberSession.exists?(original_session_id)
    assert @patient_user.reload.authenticate(original_password)

    activate(recovery.fetch(:token), password: recovery_password, now: @now + 2.minutes)

    assert identity.reload.active?
    assert_not MemberSession.exists?(original_session_id)
    assert_not @patient_user.reload.authenticate(original_password)
    assert @patient_user.authenticate(recovery_password)
    assert_equal @patient_user.id, MemberSession.find(@session.fetch(:member_session_id)).user_id
  end

  test "authenticated patient password change verifies current credentials and rotates sessions" do
    identity = activate(invite_identity.fetch(:token))
    original_session_id = @session.fetch(:member_session_id)
    replacement_password = "Patient-portal-replacement-2026!"

    assert_raises(Clinic::PatientPortal::ChangePassword::InvalidCurrentPassword) do
      Clinic::PatientPortal::ChangePassword.call(identity: identity, current_password: "incorrect-password",
        password: replacement_password, password_confirmation: replacement_password, session: @session, now: @now)
    end
    assert MemberSession.exists?(original_session_id)
    assert @patient_user.reload.authenticate(PORTAL_PASSWORD)

    replacement_session = Clinic::PatientPortal::ChangePassword.call(identity: identity,
      current_password: PORTAL_PASSWORD, password: replacement_password,
      password_confirmation: replacement_password, session: @session, now: @now + 1.minute)

    assert_not MemberSession.exists?(original_session_id)
    assert_equal replacement_session.id, @session.fetch(:member_session_id)
    assert_equal identity.id, @session.fetch(:patient_portal_identity_id)
    assert_not @patient_user.reload.authenticate(PORTAL_PASSWORD)
    assert @patient_user.authenticate(replacement_password)
    assert @practice.audit_events.exists?(action_code: "patient_portal.identity.password_change", outcome: "committed")
  end

  test "patient email changes preserve the bound portal identity and reject account collisions" do
    identity = activate(invite_identity.fetch(:token))
    original_session_id = @session.fetch(:member_session_id)
    original_email = @patient_user.email_address

    assert_raises(ArgumentError) do
      Clinic::PatientPortal::InviteIdentity.call(
        practice: @practice, patient: @patient, email_address: @actor.email_address,
        actor: @actor, now: @now + 1.minute
      )
    end
    assert_equal original_email, @patient_user.reload.email_address
    assert_nil identity.reload.invitation_digest

    changed_email = "changed-patient-#{SecureRandom.hex(6)}@example.invalid"
    recovery = Clinic::PatientPortal::InviteIdentity.call(
      practice: @practice, patient: @patient, email_address: changed_email,
      actor: @actor, now: @now + 2.minutes
    )

    assert_equal identity.id, recovery.fetch(:identity).id
    assert_equal "recovery", recovery.fetch(:purpose)
    assert_equal changed_email, @patient_user.reload.email_address
    assert_not User.exists?(email_address: original_email)
    assert MemberSession.exists?(original_session_id)
  end

  test "reserved synthetic patient activation creates access and revocation invalidates its session" do
    invitation = invite_identity
    activated = activate(invitation.fetch(:token))
    old_session_id = @session.fetch(:member_session_id)

    assert Development::TestAccounts.patient?(@patient_user)
    assert_equal @patient_user.id, MemberSession.find(old_session_id).user_id
    assert_equal 1, @patient_user.member_sessions.count

    Clinic::PatientPortal::RevokeIdentity.call(
      identity: activated,
      actor: @actor,
      reason: "Synthetic support revocation",
      now: @now + 2.minutes
    )

    assert_not MemberSession.exists?(old_session_id)
    assert_not Clinic::PatientPortal::Identity.available.exists?(id: activated.id, user_id: @patient_user.id)
    assert_equal "Synthetic support revocation", activated.reload.revoked_reason
    assert_equal 0, @patient_user.member_sessions.count
  end

  private

  PORTAL_PASSWORD = "Patient-portal-password-2026!"

  def invite_identity(practice: @practice, patient: @patient, user: @patient_user)
    Clinic::PatientPortal::InviteIdentity.call(
      practice: practice,
      patient: patient,
      user: user,
      actor: @actor,
      now: @now
    )
  end

  def activate(token, password: PORTAL_PASSWORD, password_confirmation: password, accepted_terms: true,
    terms_version: Clinic::PatientPortal::Identity::TERMS_VERSION, now: @now,
    audit_recorder: Clinic::AuditRecorder)
    @session ||= {}
    Clinic::PatientPortal::ActivateIdentity.call(
      token: token, password: password, password_confirmation: password_confirmation,
      accepted_terms: accepted_terms,
      terms_version: terms_version,
      session: @session,
      now: now,
      audit_recorder: audit_recorder
    )
  end

  def deployed
    previous = [ Rails.env, ENV["APP_CLINIC_PILOT_PRACTICE_IDS"] ]
    Rails.env = "production"
    ENV.delete("APP_CLINIC_PILOT_PRACTICE_IDS")
    yield
  ensure
    Rails.env, ENV["APP_CLINIC_PILOT_PRACTICE_IDS"] = previous
  end
end

class PatientPortalActivationSessionTest < ActionController::TestCase
  tests Clinic::PatientPortal::ActivationController

  setup do
    @controller.allow_forgery_protection = false
  end

  test "activation replaces a signed-in development staff session" do
    practice = Clinic::Practice.create!(name: "Synthetic Activation Session Practice", timezone: "UTC")
    patient = practice.patients.create!(display_name: "Synthetic Activation Patient", reference: "ACTIVATE-SESSION")
    staff = User.create!(email_address: "activation-session-staff@example.invalid", password: SecureRandom.hex(20))
    invitation = Clinic::PatientPortal::InviteIdentity.call(
      practice:, patient:, email_address: "activation-session-patient@example.invalid", actor: staff
    )
    staff_session = staff.member_sessions.create!(expires_at: MemberSession::MAX_DURATION.from_now)
    session[:member_session_id] = staff_session.id
    session[:development_demo_user_id] = staff.id
    session[:development_test_profile] = "employee-10"

    post :create, params: { patient_portal_activation: {
      token: invitation.fetch(:token), password: "Synthetic-portal-password-2026!",
      password_confirmation: "Synthetic-portal-password-2026!", accepted_terms: true,
      terms_version: Clinic::PatientPortal::Identity::TERMS_VERSION
    } }, as: :json

    assert_response :created
    identity = invitation.fetch(:identity).reload
    assert_equal identity.id, session[:patient_portal_identity_id]
    assert_equal identity.user_id, MemberSession.find(session[:member_session_id]).user_id
    assert_nil session[:development_demo_user_id]
    assert_nil session[:development_test_profile]
  end
end

class PatientPortalRecoveryControllerTest < ActionController::TestCase
  tests Clinic::PatientPortal::RecoveryController

  setup do
    @controller.allow_forgery_protection = false
    @recovery_env_names = %w[
      APP_PATIENT_PORTAL_RECOVERY_SMS_ENABLED APP_PATIENT_PORTAL_TWILIO_ACCOUNT_SID
      APP_PATIENT_PORTAL_TWILIO_API_KEY_SID APP_PATIENT_PORTAL_TWILIO_API_KEY_SECRET
      APP_PATIENT_PORTAL_TWILIO_MESSAGING_SERVICE_SID
    ]
    @recovery_env = @recovery_env_names.to_h { |name| [ name, ENV[name] ] }
    ENV.update(
      "APP_PATIENT_PORTAL_RECOVERY_SMS_ENABLED" => "true",
      "APP_PATIENT_PORTAL_TWILIO_ACCOUNT_SID" => "AC#{'a' * 32}",
      "APP_PATIENT_PORTAL_TWILIO_API_KEY_SID" => "SK#{'b' * 32}",
      "APP_PATIENT_PORTAL_TWILIO_API_KEY_SECRET" => "recovery-sms-test-secret",
      "APP_PATIENT_PORTAL_TWILIO_MESSAGING_SERVICE_SID" => "MG#{'c' * 32}"
    )
  end

  teardown do
    @recovery_env.each { |name, value| value.nil? ? ENV.delete(name) : ENV[name] = value }
  end

  test "recovery accepts an unknown contact without exposing a reset path" do
    post :create, params: { patient_portal_recovery: { contact: "unknown@example.invalid" } }, as: :json

    assert_response :accepted
    assert_equal true, response.parsed_body.fetch("accepted")
    assert_equal "If a matching portal account with a mobile number exists, a secure recovery link will be sent by text message.",
      response.parsed_body.fetch("message")
    assert_nil response.parsed_body.fetch("recovery_path")
  end

  test "matching recovery queues an encrypted SMS without changing the public response" do
    practice = Clinic::Practice.create!(name: "Recovery Practice", timezone: "UTC")
    patient = practice.patients.create!(display_name: "Recovery Patient", reference: "RECOVERY-001")
    patient.contacts.create!(practice: practice, contact_type: "phone", contact_value: "+12025550125",
      preferred: true, effective_from: 1.day.ago)
    user = User.create!(email_address: "recovery-patient@example.invalid", password: SecureRandom.hex(20), active: true)
    identity = Clinic::PatientPortal::Identity.create!(practice: practice, patient: patient, user: user,
      status: :active, invited_at: 1.hour.ago, activated_at: 30.minutes.ago)

    post :create, params: { patient_portal_recovery: { contact: user.email_address } }, as: :json
    matching_response = response.parsed_body
    assert_response :accepted

    post :create, params: { patient_portal_recovery: { contact: "unknown@example.invalid" } }, as: :json
    assert_response :accepted
    assert_equal response.parsed_body, matching_response

    delivery = identity.recovery_deliveries.sole
    assert_predicate delivery, :pending?
    assert_equal identity.reload.invitation_digest, Clinic::PatientPortal::Identity.digest_token(delivery.token)
    refute_equal delivery.token, delivery.read_attribute_before_type_cast(:token)
  end
end

class PatientPortalRecoverySmsTest < ActiveSupport::TestCase
  setup do
    @recovery_env_names = %w[
      APP_PATIENT_PORTAL_RECOVERY_SMS_ENABLED APP_PATIENT_PORTAL_TWILIO_ACCOUNT_SID
      APP_PATIENT_PORTAL_TWILIO_API_KEY_SID APP_PATIENT_PORTAL_TWILIO_API_KEY_SECRET
      APP_PATIENT_PORTAL_TWILIO_MESSAGING_SERVICE_SID
    ]
    @recovery_env = @recovery_env_names.to_h { |name| [ name, ENV[name] ] }
    ENV.update(
      "APP_PATIENT_PORTAL_RECOVERY_SMS_ENABLED" => "true",
      "APP_PATIENT_PORTAL_TWILIO_ACCOUNT_SID" => "AC#{'d' * 32}",
      "APP_PATIENT_PORTAL_TWILIO_API_KEY_SID" => "SK#{'e' * 32}",
      "APP_PATIENT_PORTAL_TWILIO_API_KEY_SECRET" => "recovery-worker-test-secret",
      "APP_PATIENT_PORTAL_TWILIO_MESSAGING_SERVICE_SID" => "MG#{'f' * 32}"
    )
    @practice = Clinic::Practice.create!(name: "Recovery Worker Practice", timezone: "UTC")
    @patient = @practice.patients.create!(display_name: "Recovery Worker Patient", reference: "RECOVERY-002")
    @patient.contacts.create!(practice: @practice, contact_type: "phone", contact_value: "+12025550126",
      preferred: true, effective_from: 1.day.ago)
    @user = User.create!(email_address: "recovery-worker@example.invalid", password: SecureRandom.hex(20), active: true)
    @identity = Clinic::PatientPortal::Identity.create!(practice: @practice, patient: @patient, user: @user,
      status: :active, invited_at: 1.hour.ago, activated_at: 30.minutes.ago)
  end

  teardown do
    @recovery_env.each { |name, value| value.nil? ? ENV.delete(name) : ENV[name] = value }
  end

  test "worker accepts one fenced Twilio delivery and erases its stored token" do
    Clinic::PatientPortal::RequestRecovery.call(contact: @user.email_address, preview: false)
    delivery = @identity.recovery_deliveries.sole
    observed = nil
    provider = Object.new
    provider.define_singleton_method(:deliver) do |to:, body:|
      observed = { to: to, body: body }
      { status: :accepted, provider_message_id: "SM#{'1' * 32}" }
    end

    result = Clinic::PatientPortal::DispatchRecoverySms.call(delivery_id: delivery.id, provider: provider)

    assert_predicate result, :accepted?
    assert_nil result.token
    assert_equal "+12025550126", observed.fetch(:to)
    assert_includes observed.fetch(:body), "/patient-portal/activate#token="
    assert_includes observed.fetch(:body), "purpose=recovery"
  end

  test "an interrupted provider attempt becomes unknown without a duplicate send" do
    Clinic::PatientPortal::RequestRecovery.call(contact: @user.email_address, preview: false)
    delivery = @identity.recovery_deliveries.sole
    delivery.update!(status: :leased, attempt_count: 1, lease_until: 1.second.ago,
      lease_token_digest: Digest::SHA256.hexdigest("interrupted-lease"))
    provider = Object.new
    provider.define_singleton_method(:deliver) { |**| raise "The interrupted SMS must not be sent again." }

    result = Clinic::PatientPortal::DispatchRecoverySms.call(delivery_id: delivery.id, provider: provider)

    assert_predicate result, :unknown?
    assert_equal "worker_interrupted", result.failure_code
    assert_nil result.token
  end
end

class PatientPortalStepUpControllerTest < ActionController::TestCase
  tests Clinic::PatientPortal::StepUpController

  setup do
    @controller.allow_forgery_protection = false
    practice = Clinic::Practice.create!(name: "Synthetic Step-Up Practice", timezone: "UTC")
    patient = practice.patients.create!(display_name: "Synthetic Step-Up Patient", reference: "STEP-001")
    user = User.create!(email_address: "synthetic-patient@example.invalid", password: SecureRandom.hex(20))
    identity = Clinic::PatientPortal::Identity.create!(
      practice: practice,
      patient: patient,
      user: user,
      status: :active,
      invited_at: 1.hour.ago,
      activated_at: 30.minutes.ago,
      accepted_terms_version: Clinic::PatientPortal::Identity::TERMS_VERSION,
      accepted_terms_at: 30.minutes.ago
    )
    member_session = user.member_sessions.create!(expires_at: 1.hour.from_now)
    session[:member_session_id] = member_session.id
    session[:patient_portal_identity_id] = identity.id
  end

  test "step-up returns the same generic unavailable response for an authenticated synthetic patient" do
    post :create, as: :json

    assert_response :service_unavailable
    assert_equal "step_up_unavailable", response.parsed_body.fetch("code")
    assert_equal "Step-up authentication is not enabled for this patient portal. Contact the clinic support team.",
      response.parsed_body.fetch("error")
  end
end
