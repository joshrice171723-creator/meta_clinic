module Public
  class ClinicServicesController < ApplicationController
    include Clinic::Api::RequestParameters

    rate_limit to: 10, within: 15.minutes, only: :create, name: "clinic_service_inquiry_submit_ip",
      with: -> { render json: { error: "Too many service requests. Please try again later." }, status: :too_many_requests }
    before_action -> { response.headers["Cache-Control"] = "no-store" }

    rescue_from Clinic::PublicServices::CaptureInquiry::Conflict do |error|
      render json: { error: error.message, code: "idempotency_conflict" }, status: :conflict
    end
    rescue_from Clinic::Api::RequestParameters::Invalid do |error|
      render_parameter_error(error)
    end
    rescue_from ArgumentError do |error|
      render json: { error: error.message, code: "invalid_request" }, status: :unprocessable_entity
    end

    def show
      practice = service_page_practice
      slug = practice.public_membership_slug

      offerings = practice.service_offerings.where(status: "published", public_visible: true).order(:name, :id)
      raise ActiveRecord::RecordNotFound unless offerings.exists?

      render json: {
        practice: { name: practice.name, slug: slug,
          headline: practice.public_page_headline, intro: practice.public_page_intro, accent: practice.public_page_accent },
        membership_path: practice.membership_storefront_enabled? ? "/memberships/#{slug}" : nil,
        services: offerings.map { |offering|
          { id: offering.id, name: offering.name, description: offering.description, duration_minutes: offering.duration_minutes, modality: offering.modality }
        }
      }
    end

    def create
      practice = service_page_practice
      input = parameter_hash!(:inquiry,
        %i[service_offering_id display_name email_address phone_number outreach_consent request_key])
      result = Clinic::PublicServices::CaptureInquiry.call(
        practice:, service_offering_id: integer_id!(input[:service_offering_id], field: :service_offering_id),
        display_name: input[:display_name], email_address: input[:email_address], phone_number: input[:phone_number],
        outreach_consent: boolean_param(input[:outreach_consent], field: :outreach_consent), request_key: input[:request_key]
      )
      render json: { inquiry: { status: "received", replayed: result.replayed } },
        status: result.replayed ? :ok : :created
    end

    private

    def service_page_practice
      slug = params[:slug].to_s
      raise ActiveRecord::RecordNotFound unless Clinic::MembershipGrowth::StorefrontConfiguration::SLUG_PATTERN.match?(slug)

      practice = Clinic::Practice.find_by!(public_membership_slug: slug)
      raise ActiveRecord::RecordNotFound unless Clinic::DeploymentAccess.practice_enabled?(practice.id)

      practice
    end
  end
end
