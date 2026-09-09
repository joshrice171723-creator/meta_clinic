module Clinic
  module Authorization
    class RoleGrantsController < Clinic::ApiController
      before_action -> { require_capability("roles.manage") }

      def index
        grants = current_practice.role_grants
        grants = grants.where(membership_id: requested_id!(params[:membership_id], :membership_id)) if params[:membership_id].present?
        grants = grants.where(scope_kind: enum_param!(params[:scope_kind], field: :scope_kind, allowed: %w[practice site])) if params[:scope_kind].present?
        paginate(grants, key: :grants, serializer: ->(grant) { AuthorizationSerializer.role_grant(grant) }, order: { id: :desc })
      end

      def create
        input = parameter_hash!(:grant, %i[membership_id role_version_id scope_kind site_id effective_from effective_until])
        membership = current_practice.memberships.find(requested_id!(input[:membership_id], :membership_id))
        role_version = RoleVersion.includes(:permissions).find(requested_id!(input[:role_version_id], :role_version_id))
        site = input[:site_id].present? ? current_practice.sites.find(requested_id!(input[:site_id], :site_id)) : nil
        grant = Clinic::Authorization::GrantAccess.call(
          grantor: current_user,
          membership: membership,
          role_version: role_version,
          scope_kind: enum_param!(input[:scope_kind], field: :scope_kind, allowed: %w[practice site]),
          site: site,
          effective_from: input[:effective_from].present? ? time_param!(input[:effective_from], field: :effective_from) : Current.business_time,
          effective_until: input[:effective_until].present? ? time_param!(input[:effective_until], field: :effective_until) : nil
        )
        render json: { grant: AuthorizationSerializer.role_grant(grant, detail: true) }, status: :created
      end

      def revoke
        grant = current_practice.role_grants.find(requested_id!(params[:id], :id))
        updated = Clinic::Authorization::RevokeAccess.call(grant: grant, grantor: current_user)
        render json: { grant: AuthorizationSerializer.role_grant(updated, detail: true) }
      end
    end
  end
end
