module Clinic
  module Workforce
    class EmployeeAccessLifecycle
      def self.revoke!(employment:, actor:, now: Time.current)
        change!(employment: employment, actor: actor, active: false, now: now)
      end

      def self.restore!(employment:, actor:, role_version:, sites:, now: Time.current)
        raise ArgumentError, "Choose an employee access role." unless role_version
        change!(employment: employment, actor: actor, active: true, role_version: role_version, sites: sites, now: now)
      end

      def self.change!(employment:, actor:, active:, role_version: nil, sites: [], now:)
        ApplicationRecord.transaction do
          locked = Employment.lock.find(employment.id)
          membership = Clinic::Membership.lock.find(locked.membership_id)
          Clinic::Membership.active.lock.find_by!(practice_id: locked.practice_id, user_id: actor.id)
          Access.new(actor: actor, practice: locked.practice, at: now).authorize!("workforce.admin")
          raise Clinic::Authorization::Denied, "You cannot revoke your own account." if membership.user_id == actor.id
          user = User.lock.find(membership.user_id)
          if active
            user.update!(active: true)
            membership.update!(active: true)
            locked.update!(status: :active, effective_until: nil)
            RoleAssignment.grant!(actor: actor, membership: membership, role_version: role_version,
              sites: sites, effective_from: now, source_employment: locked)
            action = "workforce.account.restore"
          else
            membership.role_grants.active(now).lock.each do |grant|
              grant.update!(revoked_at: now, revision: grant.revision + 1)
            end
            EmployeeInvitation.where(practice_id: locked.practice_id, staff_member_id: locked.staff_member_id,
              status: "pending").lock.each do |invitation|
              invitation.update!(status: :revoked, revoked_at: now, token_digest: nil, email_digest: nil)
            end
            locked.update!(status: :inactive, effective_until: now)
            membership.update!(active: false)
            preserve_account_access = user.clinic_memberships.active.exists? ||
              Clinic::PatientPortal::Identity.available.where(user_id: user.id).exists? || user.platform_owner_access?
            user.update!(active: false) unless preserve_account_access
            action = "workforce.account.revoke"
          end
          Clinic::AuditRecorder.record!(practice: locked.practice, actor: actor, action_code: action,
            outcome: :committed, resource_version_ref: "workforce_employment:#{locked.id}")
          locked
        end
      end
      private_class_method :change!
    end
  end
end
