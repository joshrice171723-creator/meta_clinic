module Clinic
  module Authorization
    class GrantAccess
      def self.call(grantor:, membership:, role_version:, scope_kind:, site: nil, effective_from: Time.current, effective_until: nil)
        raise Denied, "A grant cannot elevate its own account." if grantor.id == membership.user_id
        practice = membership.practice
        Authorization.authorize!(actor: grantor, practice: practice, action: "roles.manage", site: site)
        grantor_membership = Clinic::Membership.find_by!(practice: practice, user: grantor)
        ensure_grantor_can_delegate!(grantor_membership, role_version, site)

        ApplicationRecord.transaction do
          locked_membership = Clinic::Membership.lock.find(membership.id)
          grant = Clinic::RoleGrant.create!(
            practice: practice,
            membership: locked_membership,
            role_version: role_version,
            scope_kind: scope_kind,
            site: site,
            effective_from: effective_from,
            effective_until: effective_until,
            revision: 1
          )
          Clinic::RoleGrantEvent.create!(
            practice: practice,
            grant: grant,
            grantor_membership: grantor_membership,
            grant_revision: grant.revision,
            event_kind: "granted"
          )
          AuditRecorder.record!(practice: practice, actor: grantor, action_code: "roles.grant", outcome: :committed,
            resource_version_ref: "role-grant:#{grant.id}:#{grant.revision}")
          grant
        end
      end

      def self.ensure_grantor_can_delegate!(grantor_membership, role_version, site)
        role_version.permissions.each do |permission|
          Authorization.authorize!(actor: grantor_membership.user, practice: grantor_membership.practice, action: permission.action_code, site: site)
        end
      end
      private_class_method :ensure_grantor_can_delegate!
    end
  end
end
