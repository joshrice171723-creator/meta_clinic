module Clinic
  class ContextController < ApiController
    def show
      render json: {
        schema_version: "clinic-context-v1",
        user_id: current_user.id,
        practice: { id: current_practice.id, name: current_practice.name, timezone: current_practice.timezone },
        membership_id: clinic_membership.id,
        credentials: current_credential_types,
        policy_version: "clinic-authorization-v1",
        capabilities: {
          patients: allowed?("patients.read"),
          patients_write: allowed?("patients.write"),
          staff: allowed?("staff.read"),
          inventory: allowed?("inventory.read"),
          appointments: allowed?("appointments.write"),
          encounters: allowed?("encounters.write"),
          notes_read: allowed?("notes.read"),
          notes_write: allowed?("notes.write"),
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
      Clinic::Authorization.allowed?(actor: current_user, practice: current_practice, action: action, any_site: true)
    end

    def current_credential_types
      profile = current_practice.clinician_profiles.includes(:credentials).find_by(membership: clinic_membership)
      return [] unless profile

      profile.credentials.map(&:credential_type).uniq.sort
    end
  end
end
