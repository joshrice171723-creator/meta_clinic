module Development
  class DemoSandboxMembershipHistory
    STATES = %w[active failed canceled_unpaid canceled_paid pending].freeze

    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      practices = run.practice.organization.practices.order(:id).to_a
      raise ArgumentError, "Sandbox memberships need two clinics" unless practices.length == 2

      practices.each do |practice|
        versions = Clinic::Care::SubscriptionProjection.catalog(practice:).map { |offer| offer.fetch(:id) }
        raise ArgumentError, "Publish the sandbox memberships before their history" if versions.empty?

        patients = practice.patients.where("reference LIKE 'SBX-%'").order(:id).limit(STATES.length).to_a
        raise ArgumentError, "Sandbox memberships need background patients" unless patients.length == STATES.length

        STATES.zip(patients).each_with_index do |(state, patient), index|
          user = User.find_or_create_by!(email_address: "sandbox-member-#{practice.id}-#{index + 1}@example.test") do |record|
            record.password = SecureRandom.urlsafe_base64(32)
            record.active = true
          end
          user.member_sessions.destroy_all
          identity = Clinic::PatientPortal::Identity.create!(practice:, patient:, user:, status: "active",
            invited_at: Current.business_time, activated_at: Current.business_time,
            accepted_terms_version: Clinic::PatientPortal::Identity::TERMS_VERSION,
            accepted_terms_at: Current.business_time)
          agreement = Clinic::Care::SubscriptionPurchase.checkout(
            identity:, actor: user, version_id: versions.fetch(index % versions.length), selections: [],
            request_key: "sandbox-membership-#{practice.id}-#{index + 1}"
          )

          case state
          when "active", "failed", "canceled_paid"
            Clinic::Billing::SubscriptionPayments.start(
              agreement:, actor: user, request_key: "sandbox-payment-#{agreement.id}"
            )
            Clinic::Billing::SubscriptionPayments.deliver_fixture(
              agreement:, actor: run.operator_user,
              outcome: state == "failed" ? "failed" : "succeeded",
              request_key: "sandbox-payment-result-#{agreement.id}"
            )
            if state == "canceled_paid"
              Clinic::Care::SubscriptionPurchase.cancel(
                agreement:, actor: user, request_key: "sandbox-cancel-#{agreement.id}"
              )
            end
          when "canceled_unpaid"
            Clinic::Care::SubscriptionPurchase.cancel(
              agreement:, actor: user, request_key: "sandbox-cancel-#{agreement.id}"
            )
          end
        end
      end
    end
  end
end
