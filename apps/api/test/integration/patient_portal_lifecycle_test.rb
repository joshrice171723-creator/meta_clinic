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
    terms_version: Clinic::PatientPortal::Identity::TERMS_VERSION, now: @now)
    @session ||= {}
    Clinic::PatientPortal::ActivateIdentity.call(
      token: token, password: password, password_confirmation: password_confirmation,
      accepted_terms: accepted_terms,
      terms_version: terms_version,
      session: @session,
      now: now
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

class PatientPortalRecoveryControllerTest < ActionController::TestCase
  tests Clinic::PatientPortal::RecoveryController

  setup do
    @controller.allow_forgery_protection = false
  end

  test "recovery returns the same generic unavailable response for a synthetic contact" do
    post :create, params: { patient_portal_recovery: { contact: "unknown@example.invalid" } }, as: :json

    assert_response :service_unavailable
    assert_equal "recovery_unavailable", response.parsed_body.fetch("code")
    assert_equal "Self-service recovery is not enabled. Contact the clinic support team.",
      response.parsed_body.fetch("error")
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
