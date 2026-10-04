module Platform
  class InviteClinicOwner
    class Unavailable < StandardError; end

    def self.call(actor:, practice:, owner_name:, owner_email:, delivery_method: "email", owner_phone: nil, now: Time.current)
      raise Unavailable, "Owner access is required." unless actor&.active? && actor.platform_owner_access?

      email = owner_email.to_s.strip.downcase
      token = SecureRandom.urlsafe_base64(48)
      result = nil
      ApplicationRecord.transaction do
        ApplicationRecord.connection.execute(
          ApplicationRecord.sanitize_sql_array([
            "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
            "owner-command-center:invite-clinic-owner"
          ])
        )
        practice.lock!
        role = administrator_role!
        if practice.role_grants.active.joins(:role_version).where(
          role_versions: { role_code: "clinic-administrator", version: role.version }
        ).exists?
          raise Unavailable, "This clinic already has an active owner account."
        end
        raise Unavailable, "An account already uses that email address." if User.exists?(email_address: email)

        digest = Clinic::Workforce::EmployeeInvitation.digest(email)
        if Clinic::Workforce::EmployeeInvitation.pending.where(email_digest: digest).where.not(practice_id: practice.id).exists?
          raise Unavailable, "A pending clinic invitation already uses that email address."
        end

        pending = practice.workforce_employee_invitations.pending.joins(:role_version).where(
          role_versions: { role_code: "clinic-administrator", version: role.version }
        ).lock.to_a
        invitation = pending.shift
        pending.each do |stale_invitation|
          stale_invitation.update!(status: :revoked, revoked_at: now, token_digest: nil, email_digest: nil)
        end

        staff_member = invitation&.staff_member ||
          practice.staff_members.create!(display_name: owner_name, job_title: "Clinic owner")
        staff_member.update!(display_name: owner_name) unless staff_member.display_name == owner_name
        if invitation
          invitation.update!(email_address: email,
            token_digest: Clinic::Workforce::EmployeeInvitation.digest(token),
            invited_at: now, expires_at: now + Clinic::Workforce::EmployeeInvitation::INVITATION_TTL,
            effective_from: now, site_ids: site_ids_for!(practice), revoked_at: nil)
        else
          invitation = Clinic::Workforce::EmployeeInvitation.create!(practice:, staff_member:,
            invited_by_platform_user: actor, role_version: role, email_address: email,
            token_digest: Clinic::Workforce::EmployeeInvitation.digest(token), status: :pending,
            invited_at: now, expires_at: now + Clinic::Workforce::EmployeeInvitation::INVITATION_TTL,
            effective_from: now, site_ids: site_ids_for!(practice))
        end
        Clinic::AuditRecorder.record!(practice:, actor:, action_code: "platform.clinic_owner.invite",
          outcome: :committed, resource_version_ref: "workforce_employee_invitation:#{invitation.id}")
        result = { invitation:, activation_path: "/workforce/activate#token=#{URI.encode_www_form_component(token)}" }
      end

      result.merge(ClinicOwnerInvitationDelivery.call(invitation: result.fetch(:invitation), token:,
        method: delivery_method, phone_number: owner_phone, actor:))
    rescue ActiveRecord::RecordInvalid => error
      raise Unavailable, error.record.errors.full_messages.to_sentence
    end

    def self.administrator_role!
      catalog = Clinic::Authorization::PilotRoleCatalog
      role = RoleVersion.includes(:permissions).find_by(role_code: "clinic-administrator", version: catalog::VERSION)
      expected = catalog.definition("clinic-administrator").fetch(:permissions).sort
      raise Unavailable, "Clinic administrator access is not configured." unless
        role && role.permissions.map(&:action_code).sort == expected
      role
    end
    private_class_method :administrator_role!

    def self.site_ids_for!(practice)
      site_ids = practice.sites.where(status: "active").order(:id).pluck(:id)
      raise Unavailable, "This clinic needs an active site before an owner can be invited." if site_ids.empty?
      site_ids
    end
    private_class_method :site_ids_for!
  end
end
