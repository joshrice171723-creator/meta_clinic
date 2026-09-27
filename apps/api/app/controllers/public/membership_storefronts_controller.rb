module Public
  class MembershipStorefrontsController < ApplicationController
    include Clinic::Api::RequestParameters
    include MemberAuthentication

    rate_limit to: 10, within: 15.minutes, only: %i[create create_account checkout activate_account resume_checkout], name: "membership_storefront_submit_ip",
      with: -> { render json: { error: "Too many membership requests. Please try again later." }, status: :too_many_requests }
    rate_limit to: 30, within: 15.minutes, only: :handoff, name: "membership_storefront_handoff_ip",
      with: -> { render json: { error: "Portal setup is taking longer than expected. Use the link in your receipt email." },
        status: :too_many_requests }
    before_action -> { response.headers["Cache-Control"] = "no-store" }
    before_action :require_member, only: %i[current_account resume_checkout]

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
    rescue_from Clinic::MembershipGrowth::ActivateAccount::InvalidInvitation do
      render json: { error: "That account setup link is invalid or has expired.", code: "invalid_invitation" },
        status: :unprocessable_entity
    end
    rescue_from Clinic::MembershipGrowth::ActivateAccount::InvalidPassword do |error|
      render json: { error: error.message, code: "invalid_password" }, status: :unprocessable_entity
    end

    def index
      storefronts = Clinic::Practice.where(
        membership_storefront_enabled: true
      ).where.not(public_membership_slug: nil).order(:name, :id).filter_map do |practice|
        next unless Clinic::DeploymentAccess.practice_enabled?(practice.id)

        {
          name: practice.name,
          slug: practice.public_membership_slug,
          public_path: "/memberships/#{practice.public_membership_slug}"
        }
      end

      render json: { storefronts: storefronts }
    end

    def show
      practice = storefront_practice
      local_simulator = local_simulator_available?(practice)
      render json: {
        practice: { name: practice.name, slug: practice.public_membership_slug,
          headline: practice.public_page_headline, intro: practice.public_page_intro },
        services: practice.service_offerings.where(status: "published", public_visible: true).order(:name, :id).map { |offering|
          { name: offering.name, description: offering.description, duration_minutes: offering.duration_minutes, modality: offering.modality }
        },
        business_date: Current.business_date.iso8601,
        catalog: Clinic::Care::SubscriptionProjection.catalog(practice: practice),
        payment: {
          checkout_available: local_simulator || Clinic::Billing::StripeConnect.patient_checkout_available?(practice),
          mode: local_simulator ? "local_simulator" : "test",
          source: local_simulator ? Development::MembershipPaymentSimulator::SOURCE : "stripe_test",
          vendor_confirmed: false
        }
      }
    end

    def create
      practice = storefront_practice
      input = parameter_hash!(:prospect,
        %i[version_id display_name email_address phone_number source outreach_consent request_key preferred_contact_method preferred_contact_time], arrays: %i[selections])
      result = Clinic::MembershipGrowth::CaptureProspect.call(
        practice: practice,
        version_id: input[:version_id],
        selections: input[:selections] || [],
        display_name: input[:display_name],
        email_address: input[:email_address],
        phone_number: input[:phone_number],
        source: input[:source],
        outreach_consent: boolean_param(input[:outreach_consent], field: :outreach_consent),
        request_key: input[:request_key], preferred_contact_method: input[:preferred_contact_method], preferred_contact_time: input[:preferred_contact_time]
      )
      render json: { inquiry: { status: "received", replayed: result.replayed } },
        status: result.replayed ? :ok : :created
    end

    def checkout
      storefront_practice
      raise ArgumentError, "Create and activate a membership account before payment."
    end

    def create_account
      practice = storefront_practice
      local_setup = DevelopmentAccess.allowed?(request) && local_simulator_available?(practice)
      input = parameter_hash!(:account,
        %i[version_id display_name email_address phone_number date_of_birth source outreach_consent request_key], arrays: %i[selections])
      result = Clinic::MembershipGrowth::PrepareAccount.call(
        practice: practice, version_id: input[:version_id], selections: input[:selections] || [],
        display_name: input[:display_name], email_address: input[:email_address], phone_number: input[:phone_number],
        source: input[:source], outreach_consent: boolean_param(input[:outreach_consent], field: :outreach_consent),
        request_key: input[:request_key], date_of_birth: input[:date_of_birth], deliver: !local_setup
      )
      account = { status: "email_sent", replayed: result.replayed }
      if local_setup
        user = Development::SyntheticMembershipActivation.call(
          practice:, prospect: result.prospect, token: result.token)
        establish_session(user)
        account = { status: "synthetic_active", replayed: result.replayed,
          redirect_to: "/memberships/account" }
      end
      render json: { account: account },
        status: result.replayed ? :ok : :created
    end

    def activate_account
      input = parameter_hash!(:membership_account,
        %i[token password password_confirmation accepted_terms terms_version])
      token = required_string!(input[:token], field: :token, maximum: 200)
      password = password_value!(input[:password], :password)
      password_confirmation = password_value!(input[:password_confirmation], :password_confirmation)
      terms_version = required_string!(input[:terms_version], field: :terms_version, maximum: 80)
      result = Clinic::MembershipGrowth::ActivateAccount.call(token:, password:, password_confirmation:,
        accepted_terms: boolean_param(input[:accepted_terms], field: :accepted_terms), terms_version:)
      establish_session(result.user)
      render json: { account: { status: "verified", redirect_to: "/memberships/account" } }, status: :created
    end

    def current_account
      prospect = current_account_prospect
      identity = prospect.portal_identity
      patient_ready = prospect.paid_at && identity&.active? && identity.user_id == current_user.id
      session[:patient_portal_identity_id] = identity.id if patient_ready
      render json: { enrollment: {
        clinic_name: prospect.practice.name,
        package_name: prospect.selected_terms.fetch("package_name"),
        amount: prospect.selected_terms.fetch("total"), currency: prospect.selected_terms.fetch("currency"),
        renewal: prospect.selected_terms.fetch("renewal"),
        stage: prospect.enrollment_stage,
        synthetic_activation: local_simulator_available?(prospect.practice) && prospect.accepted_terms_at.nil?,
        can_pay: prospect.account_activated_at.present? && prospect.patient_id.nil? &&
          !prospect.status_declined? && prospect.recurring_authorized_at.nil? && !prospect.status_payment_processing?,
        redirect_to: patient_ready ? patient_portal_redirect(prospect) : nil,
        local_simulator: local_simulator_available?(prospect.practice) ?
          Development::MembershipPaymentSimulator.state(prospect) : { enabled: false }
      } }
    end

    def resume_checkout
      prospect = current_account_prospect
      gateway = if Development::MembershipPaymentSimulator.enabled_for?(prospect.practice)
        raise ActiveRecord::RecordNotFound unless local_simulator_request?

        Development::MembershipPaymentSimulator.gateway_for!(practice: prospect.practice, prospect:)
      end
      arguments = { practice: prospect.practice, prospect:, user: current_user }
      arguments[:gateway] = gateway if gateway
      checkout = Clinic::MembershipGrowth::PublicCheckout.start_for_account(**arguments)
      render json: { checkout: { url: checkout.checkout_url } }
    end

    def handoff
      practice = storefront_practice
      input = parameter_hash!(:handoff, %i[token])
      token = required_string!(input[:token], field: :token, maximum: 35)
      raise ActiveRecord::RecordNotFound unless token.match?(/\Aci_[a-f0-9]{32}\z/)

      prospect = practice.membership_prospects.find_by!(checkout_reference: token, intent_type: "purchase")
      if prospect.status_converted?
        render json: { onboarding: { status: "active", redirect_to: "/patient-portal" } }
      elsif prospect.status_paid_onboarding?
        render_paid_handoff(prospect)
      elsif prospect.status.in?(%w[checkout_expired payment_failed])
        render json: { onboarding: { status: "prospective_patient" } }
      else
        render json: { onboarding: { status: "preparing" } }
      end
    end

    private

    def current_account_prospect
      prospect = Clinic::MembershipProspect.find_by!(account_user_id: current_user.id, intent_type: "purchase")
      raise ActiveRecord::RecordNotFound unless Clinic::DeploymentAccess.practice_enabled?(prospect.practice_id)

      prospect
    end

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

    def local_simulator_available?(practice)
      local_simulator_request? && Development::MembershipPaymentSimulator.enabled_for?(practice)
    end

    def local_simulator_request?
      Rails.env.test? || GuidedDemoAccess.allowed?(request)
    end

    def patient_portal_redirect(prospect)
      checkout = Clinic::Billing::StripeCheckout.find_by(
        practice_id: prospect.practice_id,
        agreement_id: prospect.agreement_id
      )
      if checkout && Development::MembershipPaymentSimulator.connection?(checkout.connection)
        "/patient-portal?membership_payment=local#onboarding"
      else
        "/patient-portal?stripe_payment=return#onboarding"
      end
    end

    def render_paid_handoff(prospect)
      if prospect.account_user_id
        identity = prospect.portal_identity
        if identity&.active? && current_user&.id == prospect.account_user_id
          session[:patient_portal_identity_id] = identity.id
          render json: { onboarding: { status: "active", redirect_to: patient_portal_redirect(prospect) } }
        else
          render json: { onboarding: { status: "email_required" } }
        end
        return
      end

      identity = prospect.portal_identity
      token = prospect.portal_setup_token
      ready = identity&.invited? && token.present? && identity.invitation_expires_at&.future? &&
        ActiveSupport::SecurityUtils.secure_compare(identity.invitation_digest,
          Clinic::PatientPortal::Identity.digest_token(token))
      unless ready
        render json: { onboarding: { status: "email_required" } }
        return
      end

      render json: { onboarding: {
        status: "ready",
        redirect_to: "/patient-portal/activate#token=#{ERB::Util.url_encode(token)}&purpose=activation"
      } }
    end

    def password_value!(value, field)
      password = value.to_s
      unless password.length.between?(12, 72)
        raise Clinic::Api::RequestParameters::Invalid.new(
          "#{field} must be between 12 and 72 characters.", field: field
        )
      end
      password
    end
  end
end
