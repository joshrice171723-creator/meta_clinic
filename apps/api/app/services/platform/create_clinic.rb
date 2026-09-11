module Platform
  class CreateClinic
    class Unavailable < StandardError; end

    def self.call(actor:, organization_id:, organization_name:, clinic_name:, timezone:, owner_name:, owner_email:)
      raise Unavailable, "Owner access is required." unless actor&.active? && actor.platform_owner_access?

      email = owner_email.to_s.strip.downcase
      token = SecureRandom.urlsafe_base64(48)
      request_id = SecureRandom.uuid
      now = Time.current
      result = nil

      ApplicationRecord.transaction do
        ApplicationRecord.connection.execute(
          ApplicationRecord.sanitize_sql_array([
            "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
            "owner-command-center:create-clinic"
          ])
        )
        raise Unavailable, "An account already uses that email address." if User.exists?(email_address: email)
        if Clinic::Workforce::EmployeeInvitation.pending.exists?(
          email_digest: Clinic::Workforce::EmployeeInvitation.digest(email)
        )
          raise Unavailable, "A pending clinic invitation already uses that email address."
        end

        organization = resolve_organization(organization_id:, organization_name:)
        if organization.practices.where("lower(name) = ?", clinic_name.downcase).exists?
          raise Unavailable, "That organization already has a clinic with this name."
        end

        role = administrator_role!
        PaperTrail.request(whodunnit: actor.id.to_s,
          controller_info: { request_id:, causal_id: "owner-command-center:create-clinic" }) do
          practice = organization.practices.create!(name: clinic_name, timezone:)
          site = practice.sites.create!(code: "MAIN", name: "Main clinic", status: "active")
          staff_member = practice.staff_members.create!(display_name: owner_name, job_title: "Clinic owner")
          invitation = Clinic::Workforce::EmployeeInvitation.create!(practice:, staff_member:,
            invited_by_platform_user: actor, role_version: role, email_address: email,
            token_digest: Clinic::Workforce::EmployeeInvitation.digest(token), status: :pending,
            invited_at: now, expires_at: now + Clinic::Workforce::EmployeeInvitation::INVITATION_TTL,
            effective_from: now, site_ids: [ site.id ])
          Clinic::AuditRecorder.record!(practice:, actor:, action_code: "platform.clinic.create",
            outcome: :committed, resource_version_ref: "workforce_employee_invitation:#{invitation.id}")
          PlatformAuditEvent.create!(actor_session_reference: "user:#{actor.id}",
            action_code: "owner_command_center.clinic.create", outcome: "committed", occurred_at: now)
          result = { organization:, practice:, site:, invitation: }
        end
      end
      activation_path = "/workforce/activate?#{URI.encode_www_form(token: token)}"
      result.merge(activation_path:, delivery_status: deliver_invitation(result.fetch(:invitation), token, actor))
    rescue ActiveRecord::RecordInvalid => error
      raise Unavailable, error.record.errors.full_messages.to_sentence
    rescue ActiveRecord::RecordNotFound
      raise Unavailable, "Choose an organization that still exists."
    end

    def self.resolve_organization(organization_id:, organization_name:)
      return Organization.lock.find(organization_id) if organization_id.present?

      name = organization_name.to_s.strip
      raise Unavailable, "Enter an organization name." if name.blank?
      if Organization.where("lower(name) = ?", name.downcase).exists?
        raise Unavailable, "That organization already exists. Choose it from the list."
      end
      Organization.create!(name:)
    end
    private_class_method :resolve_organization

    def self.administrator_role!
      catalog = Clinic::Authorization::PilotRoleCatalog
      role = RoleVersion.includes(:permissions).find_by(
        role_code: "clinic-administrator", version: catalog::VERSION
      )
      expected = catalog.definition("clinic-administrator").fetch(:permissions).sort
      unless role && role.permissions.map(&:action_code).sort == expected
        raise Unavailable, "Clinic administrator access is not configured."
      end
      role
    end
    private_class_method :administrator_role!

    def self.deliver_invitation(invitation, token, actor)
      Platform::ClinicOwnerMailer.invitation(invitation.id, token).deliver_now
      Clinic::AuditRecorder.record_platform(actor:, action_code: "owner_command_center.invitation.sent",
        outcome: :committed)
      Rails.env.development? ? "prepared" : "sent"
    rescue StandardError => error
      Rails.logger.error("Clinic owner invitation delivery failed: #{error.class}")
      Clinic::AuditRecorder.record_platform(actor:, action_code: "owner_command_center.invitation.failed",
        outcome: :failed)
      "failed"
    end
    private_class_method :deliver_invitation
  end
end
