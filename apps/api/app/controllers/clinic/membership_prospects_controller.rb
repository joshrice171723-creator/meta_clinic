module Clinic
  class MembershipProspectsController < Clinic::ApiController
    wrap_parameters false

    before_action :require_growth_access, only: :index
    before_action -> { require_capability("subscriptions.review") }, only: %i[show update assisted_checkout]

    rescue_from Clinic::MembershipGrowth::TransitionProspect::InvalidTransition do |error|
      render json: { error: error.message, code: "invalid_transition" }, status: :unprocessable_entity
    end
    rescue_from Clinic::Billing::StripeGateway::Unavailable do |error|
      render json: { error: error.message, code: "stripe_unavailable" }, status: :service_unavailable
    end
    rescue_from Clinic::Billing::StripeGateway::Invalid do |error|
      render json: { error: error.message, code: "stripe_invalid" }, status: :unprocessable_entity
    end
    def index
      ability = Ability.new(current_user, practice: current_practice)
      can_review = ability.allowed_permission?("subscriptions.review")
      prospects = if can_review
        MembershipProspect.where(practice_id: current_practice.id).order(created_at: :desc, id: :desc)
      else
        MembershipProspect.none
      end
      payload = prospects.map { |prospect| MembershipProspectSerializer.call(prospect) }
      record_read!("membership_prospects.pipeline")
      render json: {
        prospects: payload,
        storefront: storefront_payload,
        capabilities: {
          review: can_review,
          configure: ability.allowed_permission?("subscription_catalog.publish")
        }
      }
    end

    def show
      prospect = MembershipProspect.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
      payload = MembershipProspectSerializer.call(prospect)
      record_read!("membership_prospects.detail", prospect)
      render json: { prospect: payload }
    end

    def update
      input = transition_input
      result = MembershipGrowth::TransitionProspect.call(
        practice: current_practice,
        actor: current_user,
        prospect_id: params[:id],
        action: input.fetch(:action),
        lock_version: input.fetch(:lock_version)
      )
      render json: { prospect: MembershipProspectSerializer.call(result.prospect) }
    end

    def assisted_checkout
      input = parameter_hash!(:prospect, %i[lock_version])
      result = MembershipGrowth::StaffAssistedCheckout.call(
        practice: current_practice,
        actor: current_user,
        prospect_id: params[:id],
        lock_version: input.require(:lock_version)
      )
      render json: {
        prospect: MembershipProspectSerializer.call(result.prospect),
        checkout_url: result.checkout_url
      }, status: :accepted
    end

    private

    def require_growth_access
      ability = Ability.new(current_user, practice: current_practice)
      return if ability.allowed_permission?("subscriptions.review") ||
        ability.allowed_permission?("subscription_catalog.publish")

      Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
        action_code: "membership_growth.read", outcome: :denied)
      raise Clinic::Authorization::Denied, "Your account does not have permission for membership growth."
    end

    def record_read!(action_code, prospect = nil)
      Clinic::AuditRecorder.record!(
        practice: current_practice,
        actor: current_user,
        action_code: action_code,
        outcome: :released,
        resource_version_ref: prospect && "membership_prospect:#{prospect.id}"
      )
    end

    def transition_input
      input = parameter_hash!(:prospect, %i[action lock_version])
      {
        action: required_string!(input[:action], field: :action, maximum: 80),
        lock_version: input.require(:lock_version)
      }
    end

    def storefront_payload
      {
        slug: current_practice.public_membership_slug,
        enabled: current_practice.membership_storefront_enabled,
        public_path: current_practice.public_membership_slug &&
          "/memberships/#{current_practice.public_membership_slug}"
      }
    end
  end
end
