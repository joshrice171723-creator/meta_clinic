module Clinic
  class MembershipStorefrontController < Clinic::ApiController
    before_action -> { require_capability("subscription_catalog.read") }, only: :show
    before_action -> { require_capability("subscription_catalog.publish") }, only: :update

    def show
      render json: { storefront: storefront_payload(current_practice) }
    end

    def update
      input = storefront_input
      practice = MembershipGrowth::StorefrontConfiguration.call(
        practice: current_practice,
        actor: current_user,
        slug_provided: input.key?(:slug),
        slug: input[:slug],
        enabled_provided: input.key?(:enabled),
        enabled: input[:enabled],
        headline_provided: input.key?(:headline), headline: input[:headline],
        intro_provided: input.key?(:intro), intro: input[:intro],
        accent_provided: input.key?(:accent), accent: input[:accent],
        logo_provided: input.key?(:logo_base64), logo_base64: input[:logo_base64],
        logo_content_type: input[:logo_content_type]
      )
      render json: { storefront: storefront_payload(practice) }
    end

    private

    def storefront_input
      parameter_hash!(:storefront, %i[slug enabled headline intro accent logo_base64 logo_content_type])
    end

    def storefront_payload(practice)
      service_page_available = practice.public_membership_slug.present? &&
        practice.service_offerings.where(status: "published", public_visible: true).exists?
      {
        slug: practice.public_membership_slug,
        enabled: practice.membership_storefront_enabled,
        headline: practice.public_page_headline,
        intro: practice.public_page_intro,
        accent: practice.public_page_accent,
        logo_path: practice.public_membership_slug.present? && practice.public_page_logo_data.present? ?
          "/api/public/clinic_services/#{practice.public_membership_slug}/logo" : nil,
        public_path: practice.public_membership_slug && "/memberships/#{practice.public_membership_slug}",
        service_page_path: service_page_available ? "/clinics/#{practice.public_membership_slug}/services" : nil
      }
    end
  end
end
