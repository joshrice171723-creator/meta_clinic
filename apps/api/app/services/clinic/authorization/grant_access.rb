module Clinic
  module Authorization
    class GrantAccess
      def self.call(grantor:, membership:, role_version:, scope_kind:, site: nil, source_employment: nil,
        effective_from: Time.current, effective_until: nil, workforce_role_assignment: false)
        raise Denied, "A grant cannot elevate its own account." if grantor.id == membership.user_id
        ApplicationRecord.transaction do
          practice = membership.practice
          grantor_membership = Clinic::Membership.active.lock.find_by!(practice: practice, user: grantor)
          Authorization.authorize!(actor: grantor, practice: practice, action: "roles.manage", site: site)
          if workforce_role_assignment
            ensure_workforce_role_assignment!(role_version, membership: membership,
              source_employment: source_employment, practice: practice)
          else
            ensure_grantor_can_delegate!(grantor_membership, role_version, site)
          end
          locked_membership = Clinic::Membership.lock.find(membership.id)
          grant = Clinic::RoleGrant.create!(
            practice: practice,
            membership: locked_membership,
            role_version: role_version,
            scope_kind: scope_kind,
            site: site,
            source_employment: source_employment,
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
          locked_membership.advance_authorization_generation!
          grant
        end
      end

      def self.ensure_grantor_can_delegate!(grantor_membership, role_version, site)
        role_version.permissions.each do |permission|
          Authorization.authorize!(actor: grantor_membership.user, practice: grantor_membership.practice, action: permission.action_code, site: site)
        end
      end
      private_class_method :ensure_grantor_can_delegate!

      def self.ensure_workforce_role_assignment!(role_version, membership:, source_employment:, practice:)
        unless Clinic::Workforce::RoleAssignment.catalogued_role?(role_version) &&
            source_employment&.practice_id == practice.id && source_employment.membership_id == membership.id
          raise Denied, "Choose a current employee access role for this employee."
        end
      end
      private_class_method :ensure_workforce_role_assignment!
    end
  end
end
