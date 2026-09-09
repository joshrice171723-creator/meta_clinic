module Clinic
  module AuthorizationSerializer
    def self.role_grant(grant, detail: false)
      payload = {
        id: grant.id,
        membership_id: grant.membership_id,
        role_version_id: grant.role_version_id,
        scope_kind: grant.scope_kind,
        site_id: grant.site_id,
        revision: grant.revision,
        effective_from: grant.effective_from&.iso8601(6),
        effective_until: grant.effective_until&.iso8601(6),
        revoked_at: grant.revoked_at&.iso8601(6)
      }
      return payload unless detail

      payload.merge(
        role_code: grant.role_version.role_code,
        role_version: grant.role_version.version,
        permissions: grant.role_version.permissions.order(:action_code).pluck(:action_code),
        events: grant.events.order(:grant_revision, :id).map { |event|
          { id: event.id, grant_revision: event.grant_revision, event_kind: event.event_kind, grantor_membership_id: event.grantor_membership_id }
        }
      )
    end
  end
end
