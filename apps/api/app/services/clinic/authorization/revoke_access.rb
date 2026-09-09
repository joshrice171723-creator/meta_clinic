module Clinic
  module Authorization
    class RevokeAccess
      def self.call(grant:, grantor:, at: Time.current)
        ApplicationRecord.transaction do
          practice = grant.practice
          grantor_membership = Clinic::Membership.active.lock.find_by!(practice: practice, user: grantor)
          Authorization.authorize!(actor: grantor, practice: practice, action: "roles.manage", site: grant.site)
          grant.with_lock do
            return grant if grant.revoked_at.present?

            grant.update!(revoked_at: at, revision: grant.revision + 1)
            Clinic::RoleGrantEvent.create!(
              practice: practice,
              grant: grant,
              grantor_membership: grantor_membership,
              grant_revision: grant.revision,
              event_kind: "revoked"
            )
            AuditRecorder.record!(practice: practice, actor: grantor, action_code: "roles.revoke", outcome: :committed,
              resource_version_ref: "role-grant:#{grant.id}:#{grant.revision}")
            Clinic::Membership.lock.find(grant.membership_id).advance_authorization_generation!
          end
        end
        grant
      end
    end
  end
end
