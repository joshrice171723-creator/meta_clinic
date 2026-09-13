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
        enabled: input[:enabled]
      )
      render json: { storefront: storefront_payload(practice) }
    end

    private

    def storefront_input
      parameter_hash!(:storefront, %i[slug enabled])
    end

    def storefront_payload(practice)
      {
        slug: practice.public_membership_slug,
        enabled: practice.membership_storefront_enabled,
        public_path: practice.public_membership_slug && "/memberships/#{practice.public_membership_slug}"
      }
    end
  end
end
