class WorkflowPropertyCase
  def access_clinic(input)
    baseline = Clinic::Practice.new(name: "Property clinic", timezone: "UTC")
    raise "Invalid clinic baseline" unless baseline.valid?
    baseline.name = input.fetch("name")
    { valid: baseline.valid?, errors: baseline.errors.attribute_names.map(&:to_s) }
  end

  def access_portal(input)
    patient = @practice.patients.create!(display_name: "Portal property #{input.fetch('suffix', 1)}", reference: SecureRandom.hex(8))
    user = User.create!(email_address: "portal-#{SecureRandom.hex(8)}@example.invalid", password: SecureRandom.hex(20))
    now = Time.current.change(usec: 0)
    mode = input.fetch("mode")
    user.update!(active: false) if mode == "inactive_invite"
    error = nil
    session = {}
    identity = nil
    begin
      invitation = Clinic::PatientPortal::InviteIdentity.call(practice: @practice, patient: patient, user: user, actor: @actor, now: now)
      identity = invitation.fetch(:identity)
      args = { token: invitation.fetch(:token), password: "Property-portal-2026!", password_confirmation: "Property-portal-2026!",
        accepted_terms: true,
        terms_version: Clinic::PatientPortal::Identity::TERMS_VERSION, session: session, now: now }
      case mode
      when "terms" then args[:accepted_terms] = input.fetch("accepted")
      when "version" then args[:terms_version] = input.fetch("version")
      when "expired" then args[:now] = identity.invitation_expires_at + input.fetch("seconds").seconds
      end
      Clinic::PatientPortal::ActivateIdentity.call(**args)
      if mode == "replay"
        Clinic::PatientPortal::ActivateIdentity.call(**args)
      elsif mode == "revoke"
        Clinic::PatientPortal::RevokeIdentity.call(identity: identity, actor: @actor, reason: "Property revocation", now: now + 1.minute)
      end
    rescue Clinic::PatientPortal::ActivateIdentity::InvalidInvitation, ArgumentError => e
      error = e.class.name
    end
    { error: error, status: identity&.reload&.status, sessions: user.member_sessions.count,
      identities: Clinic::PatientPortal::Identity.where(user: user).count,
      token_cleared: identity && identity.reload.invitation_digest.nil? }
  end

  def access_grant(input)
    user = User.create!(email_address: "grant-#{SecureRandom.hex(8)}@example.invalid", password: SecureRandom.hex(20))
    member = @practice.memberships.create!(user: user)
    grant = grant_permissions!(member, "patients.read")
    Clinic::Authorization.authorize!(actor: user, practice: @practice, action: "patients.read")
    mode = input.fetch("mode")
    if mode == "inactive"
      member.update!(active: false)
    elsif mode == "revoked"
      grant.update!(revoked_at: Time.current - input.fetch("seconds").seconds, revision: grant.revision + 1)
    elsif mode == "expired"
      grant.update!(effective_from: 2.hours.ago, effective_until: Time.current - input.fetch("seconds").seconds)
    end
    denied = false
    begin
      Clinic::Authorization.authorize!(actor: user, practice: @practice, action: "patients.read")
    rescue Clinic::Authorization::Denied
      denied = true
    end
    { denied: denied }
  end

  def access_retire_membership(input)
    grant_permissions!(@membership, "subscription_catalog.publish")
    family = Clinic::Care::SubscriptionFamily.create!(practice: @practice, name: "Retirement family", display_order: 0)
    service = Clinic::Care::ServiceOption.create!(practice: @practice, name: "Visit")
    package = Clinic::Care::SubscriptionPackage.create!(practice: @practice, family: family, name: "Retirement package",
      draft: { "amount" => input.fetch("amount"), "duration" => 1, "duration_unit" => "months", "terms" => "One visit",
        "components" => [{ "service_id" => service.id, "mode" => "included" }] })
    published = Clinic::Care::SubscriptionCatalog.publish(practice: @practice, actor: @actor, id: package.id,
      request_key: SecureRandom.uuid, lock_version: package.lock_version)
    snapshot = published.snapshot
    Clinic::Care::SubscriptionCatalog.retire(practice: @practice, actor: @actor, kind: "package", id: package.id)
    error = nil
    begin
      Clinic::Care::SubscriptionCatalog.publish(practice: @practice, actor: @actor, id: package.id,
        request_key: SecureRandom.uuid, lock_version: package.reload.lock_version)
    rescue ArgumentError => e
      error = e.message
    end
    { error: error, retired: package.reload.retired, versions: package.published_versions.count,
      snapshot_preserved: published.reload.snapshot == snapshot }
  end
end

