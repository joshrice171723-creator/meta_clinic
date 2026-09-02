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
          patient_identity_read: allowed?("patients.identity.read"),
          patients_write: allowed?("patients.write"),
          staff: allowed?("staff.read"),
          staff_write: allowed?("staff.write"),
          inventory: allowed?("inventory.read"),
          appointments: allowed?("appointments.write"),
          appointments_read: allowed?("appointments.read"),
          appointments_book: allowed?("appointments.book"),
          appointments_status_transition: allowed?("appointments.status_transition"),
          encounters: allowed?("encounters.write"),
          encounters_assign_provider: allowed?("encounters.assign_provider"),
          notes_read: allowed?("notes.read"),
          notes_write: allowed?("notes.write"),
          documents: allowed?("documents.read"),
          messages: allowed?("messages.write"),
          billing: allowed?("billing.write"),
          billing_read: allowed?("billing.read"),
          billing_invoice_draft: allowed?("billing.invoice_draft"),
          billing_invoice_post: allowed?("billing.invoice_post"),
          billing_payment_record: allowed?("billing.payment_record"),
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
