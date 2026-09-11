module Clinic
  module Workforce
    class EmployeeOnboarding
      class InvalidInvitation < StandardError; end
      class InvalidPassword < StandardError; end

      def self.invite!(practice:, email_address:, site_ids:, effective_from:, actor:, role_version: nil,
        staff_member: nil, display_name: nil, job_title: nil, now: Time.current)
        normalized_email = email_address.to_s.strip.downcase
        normalized_site_ids = LinkEmployment.normalize_site_ids(site_ids)
        role_version ||= RoleAssignment.default_role_version
        if staff_member && Employment.exists?(practice_id: practice.id, staff_member_id: staff_member.id)
          raise ArgumentError, "This directory entry is already linked to workforce."
        end
        if User.exists?(email_address: normalized_email)
          raise ArgumentError, "An account already uses this email. Choose an eligible existing clinic account instead."
        end

        raw_token = SecureRandom.urlsafe_base64(48)
        invitation = nil
        ApplicationRecord.transaction do
          inviter_membership = Clinic::Membership.active.lock.find_by!(practice_id: practice.id, user_id: actor.id)
          Access.new(actor: actor, practice: practice, at: now).authorize!("workforce.admin")
          locked_staff = if staff_member
            Clinic::Staff::Member.lock.find(staff_member.id)
          else
            practice.staff_members.create!(display_name: display_name, job_title: job_title)
          end
          sites = Clinic::Site.lock.where(id: normalized_site_ids).order(:id).to_a
          unless locked_staff.practice_id == practice.id && locked_staff.active? && sites.length == normalized_site_ids.length &&
              sites.all? { |site| site.practice_id == practice.id && site.status == "active" }
            raise ArgumentError, "The employee and work sites must be active records from this practice."
          end
          unless RoleAssignment.assignable?(actor: actor, practice: practice, role_version: role_version)
            raise Clinic::Authorization::Denied, "Your account cannot assign that workforce role."
          end

          invitation = EmployeeInvitation.lock.find_or_initialize_by(practice_id: practice.id, staff_member_id: locked_staff.id)
          raise ArgumentError, "This employee invitation has already been activated." if invitation.activated?

          invitation.assign_attributes(practice: practice, invited_by_membership: inviter_membership,
            role_version: role_version,
            email_address: normalized_email, token_digest: EmployeeInvitation.digest(raw_token),
            status: :pending, invited_at: now, expires_at: now + EmployeeInvitation::INVITATION_TTL,
            effective_from: effective_from, site_ids: normalized_site_ids, activated_at: nil, revoked_at: nil)
          invitation.save!
          Clinic::AuditRecorder.record!(practice: practice, actor: actor,
            action_code: "workforce.onboarding.invite", outcome: :committed,
            resource_version_ref: "workforce_employee_invitation:#{invitation.id}")
        end
        { invitation: invitation, token: raw_token }
      rescue ActiveRecord::RecordNotUnique
        raise ArgumentError, "That email or directory entry already has a pending employee invitation."
      end

      def self.revoke!(invitation:, actor:, now: Time.current)
        ApplicationRecord.transaction do
          Clinic::Membership.active.lock.find_by!(practice_id: invitation.practice_id, user_id: actor.id)
          Access.new(actor: actor, practice: invitation.practice, at: now).authorize!("workforce.admin")
          locked = EmployeeInvitation.lock.find(invitation.id)
          raise ArgumentError, "Only a pending employee invitation can be revoked." unless locked.pending?

          locked.update!(status: :revoked, revoked_at: now, token_digest: nil, email_digest: nil)
          Clinic::AuditRecorder.record!(practice: locked.practice, actor: actor,
            action_code: "workforce.onboarding.revoke", outcome: :committed,
            resource_version_ref: "workforce_employee_invitation:#{locked.id}")
          locked
        end
      end

      def self.activate!(token:, password:, password_confirmation:, now: Time.current)
        invitation = nil
        user = nil
        employment = nil
        ApplicationRecord.transaction do
          invitation = EmployeeInvitation.pending
            .where(token_digest: EmployeeInvitation.digest(token)).lock.first
          raise InvalidInvitation unless invitation && invitation.expires_at > now
          raise InvalidInvitation unless invitation.staff_member.active?
          raise InvalidInvitation if User.exists?(email_address: invitation.email_address)

          user = User.create!(email_address: invitation.email_address, password: password,
            password_confirmation: password_confirmation, active: true)
          membership = Clinic::Membership.create!(practice: invitation.practice, user: user, active: true)
          employment = Employment.create!(practice: invitation.practice, staff_member: invitation.staff_member,
            membership: membership, status: :active, effective_from: invitation.effective_from)
          sites = Clinic::Site.where(practice_id: invitation.practice_id, id: invitation.site_ids, status: "active").order(:id).to_a
          raise InvalidInvitation unless sites.length == invitation.site_ids.length

          sites.each do |site|
            employment.employment_sites.create!(practice: invitation.practice, site: site,
              active: true, effective_from: invitation.effective_from)
          end
          if invitation.invited_by_membership
            RoleAssignment.grant!(actor: invitation.invited_by_membership.user,
              membership: membership, role_version: invitation.role_version,
              sites: sites, effective_from: invitation.effective_from, source_employment: employment)
          else
            platform_inviter = invitation.invited_by_platform_user
            raise InvalidInvitation unless platform_inviter&.active? && platform_inviter.platform_owner_access?
            raise InvalidInvitation unless invitation.role_version.role_code == "clinic-administrator" &&
              invitation.role_version.version == Clinic::Authorization::PilotRoleCatalog::VERSION

            membership.role_grants.create!(practice: invitation.practice, role_version: invitation.role_version,
              scope_kind: "practice", source_employment: employment,
              effective_from: invitation.effective_from, revision: 1)
          end
          invitation.update!(status: :activated, activated_at: now, token_digest: nil, email_digest: nil)
          Clinic::AuditRecorder.record!(practice: invitation.practice, actor: user,
            action_code: "workforce.onboarding.activate", outcome: :committed,
            resource_version_ref: "workforce_employment:#{employment.id}")
        end
        { user: user, employment: employment }
      rescue ActiveRecord::RecordNotUnique
        raise InvalidInvitation
      rescue Clinic::Authorization::Denied
        raise InvalidInvitation
      rescue ActiveRecord::RecordInvalid => error
        if error.record.is_a?(User) && error.record.errors.attribute_names.all? { |attribute| %i[password password_confirmation].include?(attribute) }
          raise InvalidPassword, error.record.errors.full_messages.to_sentence
        end

        raise InvalidInvitation
      end
    end
  end
end
