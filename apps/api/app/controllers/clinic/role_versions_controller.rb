module Clinic
  class RoleVersionsController < ApiController
    before_action -> { require_capability("roles.manage") }

    def index
      roles = RoleVersion.includes(:permissions)
      if params[:role_code].present?
        roles = roles.where(role_code: required_string!(params[:role_code], field: :role_code, maximum: 80))
      end
      paginate(roles, key: :role_versions, serializer: ->(role) { RoleVersionSerializer.call(role) }, order: { role_code: :asc, version: :asc, id: :asc })
    end
  end
end
