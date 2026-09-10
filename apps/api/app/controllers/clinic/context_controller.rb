module Clinic
  class ContextController < ApiController
    def show
      sites = context_sites.order(:code, :id)
      current_site = sites.find_by(id: session[:clinic_site_id])
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
        authorization_generation: clinic_membership.authorization_generation,
        current_clinician_profile_id: current_clinician_profile&.id&.to_s,
        credentials: current_credential_types,
        policy_version: "clinic-authorization-v1",
        features: Clinic::Configuration::PracticeFeatures.snapshot(practice: current_practice),
        capabilities: {
          workforce_self: workforce_employment.present?,
          workforce_admin: current_ability.allowed_permission?("workforce.admin", any_site: true),
          workforce_settings: current_ability.allowed_permission?("workforce.settings", any_site: true),
          workforce_badges: current_ability.allowed_permission?("workforce.badges", any_site: true),
          workforce_timecards_read: current_ability.allowed_permission?("workforce.timecards.read", any_site: true),
          workforce_timecards_review: current_ability.allowed_permission?("workforce.timecards.review", any_site: true),
          workforce_timecards_approve: current_ability.allowed_permission?("workforce.timecards.approve", any_site: true),
          workforce_schedule_read: current_ability.allowed_permission?("workforce.schedule.read", any_site: true),
          workforce_schedule_manage: current_ability.allowed_permission?("workforce.schedule.manage", any_site: true),
          workforce_schedule_publish: current_ability.allowed_permission?("workforce.schedule.publish", any_site: true),
          workforce_requests_review: current_ability.allowed_permission?("workforce.requests.review", any_site: true),
          workforce_payroll_configure: current_ability.allowed_permission?("workforce.payroll.configure", any_site: true),
          workforce_payroll_export: current_ability.allowed_permission?("workforce.payroll.export", any_site: true),
          patients: allowed?("patients.read"),
          patient_identity_read: allowed?("patients.identity.read"),
          patient_portal_invite: allowed?("patient_portal.identity.invite"),
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
          notes_sign: allowed?("notes.sign"),
          observations_write: allowed?("observations.write"),
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
          telehealth_read: current_ability.allowed_permission?("telehealth.read", any_site: true),
          telehealth_prepare_read: current_ability.allowed_permission?("telehealth.prepare.read", any_site: true),
          telehealth_prepare_verify: current_ability.allowed_permission?("telehealth.prepare.verify", any_site: true),
          telehealth_host: current_ability.allowed_permission?("telehealth.host", any_site: true),
          telehealth_participate: current_ability.allowed_permission?("telehealth.participate", any_site: true),
          telehealth_configure: current_ability.allowed_permission?("telehealth.configure", any_site: true),
          telehealth_reconcile: current_ability.allowed_permission?("telehealth.reconcile", any_site: true),
          billing: allowed?("billing.read") || allowed?("billing.write"),
          billing_read: allowed?("billing.read") || allowed?("billing.write"),
          billing_write: allowed?("billing.write"),
          subscription_catalog_read: allowed?("subscription_catalog.read"),
          billing_invoice_draft: allowed?("billing.invoice_draft"),
          billing_invoice_post: allowed?("billing.invoice_post"),
          billing_payment_record: allowed?("billing.payment_record"),
          billing_cash_reconcile: allowed?("billing.cash_reconcile"),
          billing_catalog_manage: allowed?("billing.catalog.manage"),
          roles: allowed?("roles.manage")
        },
        current_site: current_site && FacilitySerializer.site(current_site),
        sites: sites.map { |site| FacilitySerializer.site(site) }
      }
    end

    def update
      site = context_sites.find(requested_id!(params[:site_id], :site_id))
      session[:clinic_site_id] = site.id
      render json: { current_site: FacilitySerializer.site(site) }
    end

    private

    def context_sites
      sites = accessible_clinic_sites
      if Ability::PERMISSION_RULES.keys.grep(/\Aworkforce\./).any? { |permission| current_ability.allowed_permission?(permission) }
        sites = current_practice.sites
      end
      if workforce_employment
        assigned_ids = workforce_employment.employment_sites.active.effective_at(Current.business_time).select(:site_id)
        sites = current_practice.sites.where(id: sites.select(:id)).or(current_practice.sites.where(id: assigned_ids))
      end
      sites
    end

    def workforce_employment
      return @workforce_employment if defined?(@workforce_employment)
      return nil unless defined?(Clinic::Workforce::Employment) && Clinic::Workforce::Employment.table_exists?

      employee = Clinic::Workforce::Employment.find_by(practice_id: current_practice.id, membership_id: clinic_membership.id)
      @workforce_employment = employee if employee&.active_for_work?
    end

    def allowed?(action)
      current_ability.allowed_permission?(action, any_site: true)
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
