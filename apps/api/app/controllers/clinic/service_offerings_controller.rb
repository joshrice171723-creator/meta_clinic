module Clinic
  class ServiceOfferingsController < ApiController
    before_action :require_offering_read, only: :index
    before_action -> { require_capability_with_legacy("facilities.write", "appointments.write") }, only: %i[create update publish retire]

    def index
      offerings = current_practice.service_offerings.includes(:sites, :clinicians).order(:name, :id)
      offerings = offerings.where(status: "published") if billing_only_reader?
      offerings = offerings.where(status: enum_param!(params[:status], field: :status, allowed: %w[draft published retired])) if params[:status].present?
      can_write = current_ability.practice_scope_for?("facilities.write") || current_ability.practice_scope_for?("appointments.write")
      render json: {
        service_offerings: offerings.map { |offering| ServiceOfferingSerializer.call(offering) },
        can_write: can_write,
        eligible_clinicians: can_write ? current_practice.clinician_profiles.order(:id).map { |profile|
          { id: profile.id, name: profile.display_name.presence || "Clinician ##{profile.id}" }
        } : []
      }
    end

    def create
      input = parameter_hash!(:service_offering, service_offering_fields, arrays: %i[site_ids clinician_ids])
      result = Configuration::ManageServiceOffering.create(
        practice: current_practice, actor: current_user,
        request_key: required_string!(input[:request_key], field: :request_key, maximum: 160), attributes: input.except(:request_key)
      )
      render_result(result, created: true)
    end

    def update
      offering = current_practice.service_offerings.find(requested_id!(params[:id], :id))
      input = parameter_hash!(:service_offering, service_offering_fields, arrays: %i[site_ids clinician_ids])
      result = Configuration::ManageServiceOffering.update(
        practice: current_practice, actor: current_user, offering: offering,
        request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
        lock_version: bounded_integer!(input[:lock_version], field: :lock_version, min: 0, max: 2_147_483_647),
        attributes: input.except(:request_key, :lock_version)
      )
      render_result(result)
    end

    def publish
      offering = current_practice.service_offerings.find(requested_id!(params[:id], :id))
      input = parameter_hash!(:service_offering, %i[request_key lock_version])
      result = Configuration::ManageServiceOffering.publish(
        practice: current_practice, actor: current_user, offering: offering,
        request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
        lock_version: bounded_integer!(input[:lock_version], field: :lock_version, min: 0, max: 2_147_483_647)
      )
      render_result(result)
    end

    def retire
      offering = current_practice.service_offerings.find(requested_id!(params[:id], :id))
      input = parameter_hash!(:service_offering, %i[request_key lock_version])
      result = Configuration::ManageServiceOffering.retire(
        practice: current_practice, actor: current_user, offering: offering,
        request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
        lock_version: bounded_integer!(input[:lock_version], field: :lock_version, min: 0, max: 2_147_483_647)
      )
      render_result(result)
    end

    private

    def require_offering_read
      return if current_ability.allowed_permission?("facilities.read", any_site: true) ||
        current_ability.allowed_permission?("appointments.book", any_site: true) ||
        current_ability.allowed_permission?("billing.invoice_draft", any_site: true) ||
        current_ability.allowed_permission?("billing.write", any_site: true)

      require_capability_with_legacy("facilities.read", "appointments.book", any_site: true)
    end

    def billing_only_reader?
      !current_ability.allowed_permission?("facilities.read", any_site: true) &&
        !current_ability.allowed_permission?("appointments.book", any_site: true)
    end

    def service_offering_fields
      %i[request_key lock_version name code description contact_instructions referral_instructions referral_required visit_type_id billing_service_id duration_minutes modality booking_required requires_room public_visible status site_ids clinician_ids]
    end

    def render_result(result, created: false)
      render json: { service_offering: ServiceOfferingSerializer.call(result.offering), replayed: result.replayed },
        status: created && !result.replayed ? :created : :ok
    end
  end
end
