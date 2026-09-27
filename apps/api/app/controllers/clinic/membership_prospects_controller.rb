module Clinic
  class MembershipProspectsController < Clinic::ApiController
    wrap_parameters false

    before_action :require_growth_access, only: :index
    before_action -> { require_capability("subscriptions.review") }, only: %i[show update phone_payment refresh_phone_payment]

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
        MembershipProspect.where(practice_id: current_practice.id, patient_id: nil).order(created_at: :desc, id: :desc)
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

    def phone_payment
      input = parameter_hash!(:prospect, %i[lock_version authorization_confirmed authorization_version])
      result = MembershipGrowth::StaffPhonePayment.start(
        practice: current_practice,
        actor: current_user,
        prospect_id: params[:id],
        lock_version: input.require(:lock_version),
        authorization_confirmed: input[:authorization_confirmed] == true,
        authorization_version: required_string!(input[:authorization_version], field: :authorization_version, maximum: 80)
      )
      render json: {
        prospect: MembershipProspectSerializer.call(result.prospect),
        phone_payment: result.payment
      }, status: :accepted
    end

    def refresh_phone_payment
      result = MembershipGrowth::StaffPhonePayment.refresh(
        practice: current_practice,
        actor: current_user,
        prospect_id: params[:id]
      )
      render json: {
        prospect: MembershipProspectSerializer.call(result.prospect),
        phone_payment: result.payment
      }
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
      service_page_available = current_practice.public_membership_slug.present? &&
        current_practice.service_offerings.where(status: "published", public_visible: true).exists?
      {
        slug: current_practice.public_membership_slug,
        enabled: current_practice.membership_storefront_enabled,
        headline: current_practice.public_page_headline,
        intro: current_practice.public_page_intro,
        accent: current_practice.public_page_accent,
        logo_path: current_practice.public_membership_slug.present? && current_practice.public_page_logo_data.present? ?
          "/api/public/clinic_services/#{current_practice.public_membership_slug}/logo" : nil,
        public_path: current_practice.public_membership_slug &&
          "/memberships/#{current_practice.public_membership_slug}",
        service_page_path: service_page_available ? "/clinics/#{current_practice.public_membership_slug}/services" : nil
      }
    end
  end
end
