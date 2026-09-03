module Clinic
  class BaseController < ApplicationController
    include Clinic::Api::RequestParameters
    include Clinic::Api::Pagination

    before_action :require_prototype
    before_action :require_member
    before_action :require_clinic
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

    def attribute_clinic_mutations
      # Generate correlation on the server; never trust submitted audit metadata.
      PaperTrail.request(whodunnit: current_user.id.to_s,
        controller_info: { request_id: SecureRandom.uuid }) do
        yield
        record_sensitive_read
      end
    rescue Clinic::AuditRecorder::Unavailable
      # The action has rendered, but the response must not release protected data
      # when its required evidence cannot be persisted.
      render_audit_unavailable
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
      return unless Rails.env.production?
      return if Staging::DemoClinic.available_to?(current_user)

      render_error("The clinic workspace is a local synthetic prototype and is not released.", :not_found)
    end

    def clinic_membership
      @clinic_membership ||= Membership.active.find_by(user: current_user)
    end

    def current_practice
      clinic_membership&.practice
    end

    def require_clinic
      render_error("No active clinic assignment. Ask your developer to provision access.", :forbidden) unless clinic_membership
    end

    def require_capability(capability, any_site: false)
      permission = Ability.normalize_permission(capability)
      Clinic::Authorization.authorize!(actor: current_user, practice: current_practice, action: permission, any_site: any_site)
    end

    def require_capability_with_legacy(capability, legacy_capability, site: nil, any_site: false)
      Clinic::Authorization.authorize_with_legacy!(actor: current_user, practice: current_practice,
        action: capability, legacy_action: legacy_capability, site: site, any_site: any_site)
    end

    def current_ability
      @current_ability ||= Ability.new(current_user, practice: current_practice)
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
      when [ "clinic/care/patient_addresses", "index" ] then "patient_addresses.read"
      when [ "clinic/documents", "index" ], [ "clinic/documents", "show" ] then "documents.read"
      when [ "clinic/document_categories", "index" ] then "documents.categories.read"
      when [ "clinic/billing/invoices", "index" ], [ "clinic/billing/invoices", "show" ] then "billing.read"
      when [ "clinic/billing/dashboard", "show" ] then "billing.read"
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
