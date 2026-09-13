module Public
  class MembershipStorefrontsController < ApplicationController
    include Clinic::Api::RequestParameters

    rate_limit to: 10, within: 15.minutes, only: %i[create checkout], name: "membership_storefront_submit_ip",
      with: -> { render json: { error: "Too many membership requests. Please try again later." }, status: :too_many_requests }
    before_action -> { response.headers["Cache-Control"] = "no-store" }

    rescue_from Clinic::MembershipGrowth::CaptureProspect::Conflict do |error|
      render json: { error: error.message, code: "idempotency_conflict" }, status: :conflict
    end
    rescue_from Clinic::Api::RequestParameters::Invalid do |error|
      render_parameter_error(error)
    end
    rescue_from ArgumentError do |error|
      render json: { error: error.message, code: "invalid_request" }, status: :unprocessable_entity
    end
    rescue_from ActiveRecord::RecordInvalid do |error|
      render json: { error: error.record.errors.full_messages.to_sentence, code: "invalid_request" },
        status: :unprocessable_entity
    end
    rescue_from ActiveRecord::RecordNotUnique do
      render json: { error: "That request conflicts with an existing enrollment.", code: "already_exists" }, status: :conflict
    end
    rescue_from Clinic::Billing::StripeGateway::Unavailable do |error|
      render json: { error: error.message, code: "checkout_unavailable" }, status: :service_unavailable
    end
    rescue_from Clinic::Billing::StripeGateway::Invalid do
      render json: { error: "Secure checkout could not be validated. Please try again.", code: "checkout_invalid" },
        status: :unprocessable_entity
    end

    def show
      practice = storefront_practice
      render json: {
        practice: { name: practice.name, slug: practice.public_membership_slug },
        catalog: Clinic::Care::SubscriptionProjection.catalog(practice: practice),
        payment: { checkout_available: Clinic::Billing::StripeConnect.patient_checkout_available?(practice), mode: "test" }
      }
    end

    def create
      practice = storefront_practice
      input = parameter_hash!(:prospect,
        %i[version_id display_name email_address phone_number source outreach_consent request_key], arrays: %i[selections])
      result = Clinic::MembershipGrowth::CaptureProspect.call(
        practice: practice,
        version_id: input[:version_id],
        selections: input[:selections] || [],
        display_name: input[:display_name],
        email_address: input[:email_address],
        phone_number: input[:phone_number],
        source: input[:source],
        outreach_consent: boolean_param(input[:outreach_consent], field: :outreach_consent),
        request_key: input[:request_key]
      )
      render json: { inquiry: { status: "received", replayed: result.replayed } },
        status: result.replayed ? :ok : :created
    end

    def checkout
      practice = storefront_practice
      input = parameter_hash!(:checkout,
        %i[version_id display_name email_address phone_number source outreach_consent request_key], arrays: %i[selections])
      result = Clinic::MembershipGrowth::PublicCheckout.start(
        practice: practice,
        version_id: input[:version_id],
        selections: input[:selections] || [],
        display_name: input[:display_name],
        email_address: input[:email_address],
        phone_number: input[:phone_number],
        source: input[:source],
        outreach_consent: boolean_param(input[:outreach_consent], field: :outreach_consent),
        request_key: input[:request_key]
      )
      render json: { checkout: { url: result.checkout_url, status: result.prospect.status,
        replayed: result.replayed } }, status: result.replayed ? :ok : :created
    end

    private

    def storefront_practice
      slug = params[:slug].to_s
      raise ActiveRecord::RecordNotFound unless
        Clinic::MembershipGrowth::StorefrontConfiguration::SLUG_PATTERN.match?(slug)

      practice = Clinic::Practice.find_by!(
        public_membership_slug: slug,
        membership_storefront_enabled: true
      )
      raise ActiveRecord::RecordNotFound unless Clinic::DeploymentAccess.practice_enabled?(practice.id)

      practice
    end
  end
end
