module Clinic
  class ServiceOfferingsController < ApiController
    before_action -> { require_capability_with_legacy("facilities.read", "appointments.book", any_site: true) }, only: :index
    before_action -> { require_capability_with_legacy("facilities.write", "appointments.write") }, only: %i[create update publish]

    def index
      offerings = current_practice.service_offerings.includes(:sites).order(:name, :id)
      offerings = offerings.where(status: enum_param!(params[:status], field: :status, allowed: %w[draft published retired])) if params[:status].present?
      render json: {
        service_offerings: offerings.map { |offering| ServiceOfferingSerializer.call(offering) },
        can_write: current_ability.practice_scope_for?("facilities.write") || current_ability.practice_scope_for?("appointments.write")
      }
    end

    def create
      input = parameter_hash!(:service_offering, service_offering_fields, arrays: %i[site_ids])
      result = Configuration::ManageServiceOffering.create(
        practice: current_practice, actor: current_user,
        request_key: required_string!(input[:request_key], field: :request_key, maximum: 160), attributes: input.except(:request_key)
      )
      render_result(result, created: true)
    end

    def update
      offering = current_practice.service_offerings.find(requested_id!(params[:id], :id))
      input = parameter_hash!(:service_offering, service_offering_fields, arrays: %i[site_ids])
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

    private

    def service_offering_fields
      %i[request_key lock_version name code description visit_type_id billing_service_id duration_minutes modality booking_required requires_room status site_ids]
    end

    def render_result(result, created: false)
      render json: { service_offering: ServiceOfferingSerializer.call(result.offering), replayed: result.replayed },
        status: created && !result.replayed ? :created : :ok
    end
  end
end
