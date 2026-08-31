module Clinic
  class ContextController < ApiController
    def show
      render json: {
        schema_version: "clinic-context-v1",
        user_id: current_user.id,
        practice: { id: current_practice.id, name: current_practice.name, timezone: current_practice.timezone },
        membership_id: clinic_membership.id,
        policy_version: "clinic-authorization-v1",
        capabilities: {
          patients: allowed?("patients.read"),
          staff: allowed?("staff.read"),
          inventory: allowed?("inventory.read"),
          appointments: allowed?("appointments.write"),
          encounters: allowed?("encounters.write"),
          documents: allowed?("documents.read"),
          messages: allowed?("messages.write"),
          billing: allowed?("billing.write"),
          roles: allowed?("roles.manage")
        },
        sites: current_practice.sites.order(:code, :id).map { |site| FacilitySerializer.site(site) }
      }
    end

    private

    def allowed?(action)
      Clinic::Authorization.allowed?(actor: current_user, practice: current_practice, action: action)
    end
  end
end
