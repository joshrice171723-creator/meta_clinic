module Clinic
  class ContextController < ApiController
    def show
      sites = accessible_clinic_sites.order(:code, :id)
      current_site = current_clinic_site
      session.delete(:clinic_site_id) if session[:clinic_site_id].present? && current_site.nil?
      if current_site.nil? && sites.one?
        current_site = sites.first
        session[:clinic_site_id] = current_site.id
      end

      render json: {
        schema_version: "clinic-context-v1",
        user_id: current_user.id,
        practice: { id: current_practice.id, name: current_practice.name, timezone: current_practice.timezone },
        membership_id: clinic_membership.id,
        current_clinician_profile_id: current_clinician_profile&.id&.to_s,
        credentials: current_credential_types,
        policy_version: "clinic-authorization-v1",
        capabilities: {
          patients: allowed?("patients.read"),
          patient_identity_read: allowed?("patients.identity.read"),
          patients_write: allowed?("patients.write"),
          staff: allowed?("staff.read"),
          staff_write: allowed?("staff.write"),
          facilities_read: allowed?("facilities.read") || allowed?("appointments.book"),
          facilities_write: allowed?("facilities.write") || allowed?("appointments.write"),
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
          staff_messaging_read: allowed?("staff_messaging.read"),
          staff_messaging_send: allowed?("staff_messaging.send"),
          staff_messaging_create_conversation: allowed?("staff_messaging.create_conversation"),
          staff_messaging_acknowledge: allowed?("staff_messaging.acknowledge"),
          staff_messaging_transition: allowed?("staff_messaging.transition"),
          staff_messaging_escalate: allowed?("staff_messaging.escalate"),
          reminders: allowed?("reminders.read"),
          reminders_write: allowed?("reminders.write"),
          scribe_read: allowed?("scribe.read"),
          scribe_write: allowed?("scribe.write"),
          scribe_approve: allowed?("scribe.approve"),
          scribe_export: allowed?("scribe.export"),
          scribe_delete: allowed?("scribe.delete"),
          billing: allowed?("billing.read") || allowed?("billing.write"),
          billing_read: allowed?("billing.read") || allowed?("billing.write"),
          subscription_catalog_read: allowed?("subscription_catalog.read"),
          billing_invoice_draft: allowed?("billing.invoice_draft"),
          billing_invoice_post: allowed?("billing.invoice_post"),
          billing_payment_record: allowed?("billing.payment_record"),
          billing_cash_reconcile: allowed?("billing.cash_reconcile"),
          roles: allowed?("roles.manage")
        },
        current_site: current_site && FacilitySerializer.site(current_site),
        sites: sites.map { |site| FacilitySerializer.site(site) }
      }
    end

    def update
      site = accessible_clinic_sites.find(requested_id!(params[:site_id], :site_id))
      session[:clinic_site_id] = site.id
      render json: { current_site: FacilitySerializer.site(site) }
    end

    private

    def allowed?(action)
      Clinic::Authorization.allowed?(actor: current_user, practice: current_practice, action: action, any_site: true)
    end

    def current_credential_types
      profile = current_clinician_profile
      return [] unless profile

      profile.credentials.map(&:credential_type).uniq.sort
    end

    def current_clinician_profile
      @current_clinician_profile ||= current_practice.clinician_profiles.find_by(membership: clinic_membership)
    end
  end
end
