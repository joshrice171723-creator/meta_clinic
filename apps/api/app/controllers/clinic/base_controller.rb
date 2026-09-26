module Clinic
  class BaseController < ApplicationController
    include Clinic::Api::RequestParameters
    include Clinic::Api::Pagination

    SETUP_ENDPOINTS = {
      "clinic/context" => %w[show update],
      "clinic/facilities" => %w[index create create_department create_room update update_room],
      "clinic/practice_features" => %w[show update],
      "clinic/visit_types" => %w[create update],
      "clinic/clinicians" => %w[index create],
      "clinic/scheduling/site_policies" => %w[show update]
    }.freeze

    before_action :require_prototype
    before_action :require_member
    before_action :require_expected_actor
    before_action :require_clinic
    before_action :require_expected_practice
    before_action :require_finalized_site_profile
    before_action :capture_authorization_generation
    around_action :attribute_clinic_mutations

    rescue_from Clinic::Authorization::Denied, CanCan::AccessDenied do
      render_error("Your account does not have permission for this clinic action.", :forbidden)
    end

    rescue_from Clinic::AuditRecorder::Unavailable do
      render_audit_unavailable
    end

    rescue_from ActiveRecord::InvalidForeignKey do
      render_error("The related records do not belong to the selected context.", :unprocessable_entity)
    end

    rescue_from ActiveRecord::RecordInvalid do |error|
      render_error(error.record.errors.full_messages.to_sentence, :unprocessable_entity)
    end

    rescue_from Clinic::Api::RequestParameters::Invalid do |error|
      render_parameter_error(error)
    end

    private

    def require_expected_actor
      expected = request.headers["X-Clinic-Actor"]
      return if expected.blank? || expected == current_user&.id.to_s

      render json: { error: "Your account changed in another window. Reopen the clinic workspace before continuing.", code: "session_changed" }, status: :conflict
    end

    def attribute_clinic_mutations
      # Generate correlation on the server; never trust submitted audit metadata.
      operation = lambda do
        PaperTrail.request(whodunnit: current_user.id.to_s,
          controller_info: { request_id: SecureRandom.uuid }) do
          yield
          record_sensitive_read
        end
      end
      if request.get? || request.head?
        operation.call
      else
        attribute_clinic_mutation(operation)
        if response.successful?
          Clinic::Realtime::Publisher.publish(
            practice: current_practice,
            topics: Clinic::Realtime::Publisher.topics_for(controller_path, action_name)
          )
        end
      end
    rescue Clinic::AuditRecorder::Unavailable
      # The action has rendered, but the response must not release protected data
      # when its required evidence cannot be persisted.
      render_audit_unavailable
    end

    def attribute_clinic_mutation(operation)
      ApplicationRecord.transaction do
        locked = Clinic::Membership.lock.find(clinic_membership.id)
        unless locked.active? && locked.user.active? && locked.authorization_generation == @authorization_generation
          raise Clinic::Authorization::Denied, "Your clinic access changed. Reopen the workspace before continuing."
        end
        @clinic_membership = locked
        @current_ability = nil
        operation.call
      end
    rescue Clinic::Authorization::Denied => error
      restore_rolled_back_denial!(error)
      raise
    end

    def restore_rolled_back_denial!(error)
      return if error.action_code.blank?
      return if error.audit_event_id.present? && current_practice.audit_events.exists?(id: error.audit_event_id)

      Clinic::AuditRecorder.record!(
        practice: current_practice,
        actor: current_user,
        action_code: error.action_code,
        outcome: :denied
      )
    end

    def render_error(message, status)
      render json: { error: message }, status: status
    end

    def render_audit_unavailable
      payload = { error: "The clinic audit service is unavailable. Try again later.", code: "audit_unavailable" }
      if performed?
        self.status = :service_unavailable
        self.content_type = "application/json"
        self.response_body = [ payload.to_json ]
      else
        render json: payload, status: :service_unavailable
      end
    end

    def require_prototype
      return if Clinic::DeploymentAccess.available_to?(current_user)

      render_error("The clinic workspace is unavailable.", :not_found)
    end

    def clinic_membership
      @clinic_membership ||= if session[:clinic_membership_id].present?
        Membership.active.find_by(user: current_user, id: session[:clinic_membership_id])
      else
        Membership.active.where(user: current_user).order(:id).first
      end
    end

    def current_practice
      clinic_membership&.practice
    end

    def require_clinic
      unless clinic_membership && DeploymentAccess.practice_enabled?(current_practice.id)
        render_error("No active clinic assignment. Contact your clinic administrator.", :forbidden)
      end
    end

    def require_expected_practice
      expected = request.headers["X-Clinic-Practice"]
      return if expected.blank? || expected == current_practice.id.to_s

      render json: { error: "Your clinic changed in another window. Reload before continuing.", code: "clinic_changed" }, status: :conflict
    end

    def require_finalized_site_profile
      site_id = session[:clinic_site_id]
      return if site_id.blank?

      site = current_practice.sites.find_by(id: site_id)
      return unless site

      features = Clinic::Configuration::PracticeFeatures.snapshot(practice: current_practice, site:)
      return if features[:site_specialty_configured] && features[:finalized]
      return if setup_endpoint_allowed?

      render json: {
        error: "Complete clinic setup for this location before opening its workspaces.",
        code: "clinic_setup_required",
        setup_url: "/clinic/setup"
      }, status: :conflict
    end

    def setup_endpoint_allowed?
      actions = SETUP_ENDPOINTS[controller_path]
      return false unless actions&.include?(action_name)
      return params[:setup].to_s == "true" if controller_path == "clinic/clinicians" && action_name == "index"

      true
    end

    def capture_authorization_generation
      @authorization_generation = clinic_membership.authorization_generation
    end

    def require_capability(capability, site: nil, any_site: false)
      permission = Ability.normalize_permission(capability)
      Clinic::Authorization.authorize!(actor: current_user, practice: current_practice,
        action: permission, site: site, any_site: any_site)
    end

    def require_capability_with_legacy(capability, legacy_capability, site: nil, any_site: false)
      Clinic::Authorization.authorize_with_legacy!(actor: current_user, practice: current_practice,
        action: capability, legacy_action: legacy_capability, site: site, any_site: any_site)
    end

    def current_ability
      @current_ability ||= Ability.new(current_user, practice: current_practice)
    end

    def accessible_clinic_sites
      sites = current_practice.sites
      return sites if current_ability.practice_scope_for?("facilities.read") ||
        current_ability.practice_scope_for?("appointments.book")

      sites.where(id: current_ability.accessible_site_ids)
    end

    def current_clinic_site
      site_id = session[:clinic_site_id]
      return unless site_id.present?

      accessible_clinic_sites.find_by(id: site_id)
    end

    # Keep positive-id parsing available to every clinic controller. ApiController
    # has the same helper for its specialized error handlers, but most clinic
    # endpoints intentionally inherit directly from this shared boundary.
    def requested_id!(value, field)
      integer_id!(value, field: field)
    end

    def boolean_or_default(value, field:, default: false)
      value.nil? ? default : boolean_param(value, field: field)
    end

    def record_sensitive_read
      action_code = sensitive_read_action
      return unless action_code && response.successful?

      Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
        action_code: action_code, outcome: :released)
    end

    def sensitive_read_action
      case [ controller_path, action_name ]
      when [ "clinic/care/patients", "index" ], [ "clinic/care/patients", "show" ] then "patients.read"
      when [ "clinic/care/patients", "lookup" ] then "patients.identity.read"
      when [ "clinic/care/patient_care_summaries", "show" ] then "patients.read"
      when [ "clinic/care/patient_chart_history", "show" ], [ "clinic/scheduling/tracking_board", "show" ] then "patients.read"
      when [ "clinic/care/encounter_notes", "index" ], [ "clinic/care/encounter_notes", "show" ] then "notes.read"
      when [ "clinic/care/observations", "index" ] then "observations.read"
      when [ "clinic/care/vital_signs", "show" ] then "patients.read"
      when [ "clinic/care/visit_instructions", "show" ] then "notes.read"
      when [ "clinic/care/patient_addresses", "index" ] then "patient_addresses.read"
      when [ "clinic/documents", "index" ], [ "clinic/documents", "show" ] then "documents.read"
      when [ "clinic/document_categories", "index" ] then "documents.categories.read"
      when [ "clinic/billing/invoices", "index" ], [ "clinic/billing/invoices", "show" ] then "billing.read"
      when [ "clinic/billing/dashboard", "show" ] then "billing.read"
      when [ "clinic/billing/dashboard", "income_outlook" ] then "billing.read"
      when [ "clinic/billing/support_requests", "index" ] then "billing.read"
      when [ "clinic/messaging/message_intents", "index" ], [ "clinic/messaging/message_intents", "show" ] then "messages.read"
      when [ "clinic/scheduling/appointments", "index" ], [ "clinic/scheduling/appointments", "show" ] then "appointments.read"
      when [ "clinic/scheduling/encounters", "index" ], [ "clinic/scheduling/encounters", "show" ] then "encounters.read"
      when [ "clinic/staff/members", "index" ] then "staff.read"
      when [ "clinic/clinicians", "index" ] then "clinicians.read"
      when [ "clinic/inventory/items", "index" ] then "inventory.read"
      when [ "clinic/inventory/pharmacy", "index" ], [ "clinic/inventory/pharmacy", "show" ] then "inventory.read"
      when [ "clinic/inventory/management", "bootstrap" ], [ "clinic/inventory/management", "catalog" ],
        [ "clinic/inventory/management", "replenishment" ], [ "clinic/inventory/management", "purchase_orders" ],
        [ "clinic/inventory/management", "purchase_order" ], [ "clinic/inventory/management", "receiving" ],
        [ "clinic/inventory/management", "lots" ], [ "clinic/inventory/management", "activity" ],
        [ "clinic/inventory/management", "recalls" ], [ "clinic/inventory/management", "controlled" ] then "inventory.read"
      when [ "clinic/role_versions", "index" ], [ "clinic/authorization/role_grants", "index" ] then "roles.read"
      when [ "clinic/operation_receipts", "show" ] then "audit.receipts.read"
      end
    end
  end
end
