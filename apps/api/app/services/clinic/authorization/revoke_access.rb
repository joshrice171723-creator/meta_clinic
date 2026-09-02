module Clinic
  module Authorization
    class RevokeAccess
      def self.call(grant:, grantor:, at: Time.current)
        raise Denied, "The grantor must belong to the grant practice." unless grant.practice_id == grantor.clinic_membership&.practice_id

        Authorization.authorize!(actor: grantor, practice: grant.practice, action: "roles.manage", site: grant.site)

        ApplicationRecord.transaction do
          grant.with_lock do
            return grant if grant.revoked_at.present?

            grant.update!(revoked_at: at, revision: grant.revision + 1)
            Clinic::RoleGrantEvent.create!(
              practice: grant.practice,
              grant: grant,
              grantor_membership: grantor.clinic_membership,
              grant_revision: grant.revision,
              event_kind: "revoked"
            )
            AuditRecorder.record!(practice: grant.practice, actor: grantor, action_code: "roles.revoke", outcome: :committed,
              resource_version_ref: "role-grant:#{grant.id}:#{grant.revision}")
          end
        end
        grant
      end
    end
  end
end
