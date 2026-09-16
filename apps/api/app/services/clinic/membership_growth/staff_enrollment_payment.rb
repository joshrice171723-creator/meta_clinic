module Clinic
  module MembershipGrowth
    class StaffEnrollmentPayment
      OneTimeResult = Struct.new(:prospect, keyword_init: true)

      def self.start(practice:, actor:, prospect_id:, lock_version:, authorization_confirmed:,
        authorization_version:, gateway: Clinic::Billing::StripeGateway.new)
        Clinic::Authorization.authorize!(practice:, actor:, action: "subscriptions.review")
        prospect = MembershipProspect.where(practice_id: practice.id).find(prospect_id)
        raise TransitionProspect::InvalidTransition, "This enrollment is no longer ready for front-desk payment." unless
          prospect.source == "front_desk_enrollment" && prospect.intent_type == "purchase" &&
          prospect.status_new? && prospect.follow_up_state == "open"
        raise ArgumentError, "This membership requires clinic review before payment." if
          prospect.selected_terms.fetch("eligibility_review", false)

        transitioned = TransitionProspect.call(
          practice:,
          actor:,
          prospect_id: prospect.id,
          action: "begin_call",
          lock_version:
        )
        StaffPhonePayment.start(
          practice:,
          actor:,
          prospect_id: transitioned.prospect.id,
          lock_version: transitioned.prospect.reload.lock_version,
          authorization_confirmed:,
          authorization_version:,
          gateway:
        )
      end

      def self.simulate_one_time(practice:, actor:, prospect_id:, lock_version:, request_key:)
        Clinic::Authorization.authorize!(practice:, actor:, action: "subscriptions.review")
        unless Development::MembershipPaymentSimulator.enabled_for?(practice)
          raise ArgumentError,
            "One-time staff card simulation is available only for a configured local development clinic. Use an approved production payment workflow."
        end

        result = nil
        prospect = MembershipProspect.where(practice_id: practice.id).find(prospect_id)
        prospect.with_lock do
          validate_one_time_prospect!(prospect)
          unless prospect.lock_version == lock_version || prospect.status.in?(%w[paid_onboarding converted])
            raise ActiveRecord::StaleObjectError.new(prospect, "simulate one-time payment")
          end

          result = Development::MembershipPaymentSimulator.record_staff_one_time!(
            practice:, prospect:, actor:, request_key:
          )
        end
        OneTimeResult.new(prospect: result.prospect)
      end

      def self.validate_one_time_prospect!(prospect)
        valid = prospect.source == "front_desk_enrollment" && prospect.intent_type == "purchase" &&
          prospect.selected_terms.fetch("renewal") == "none" &&
          prospect.status.in?(%w[new checkout_pending payment_failed paid_onboarding converted])
        raise TransitionProspect::InvalidTransition,
          "This enrollment is not ready for a one-time simulated payment." unless valid
        raise ArgumentError, "This membership requires clinic review before payment." if
          prospect.selected_terms.fetch("eligibility_review", false)
      end
      private_class_method :validate_one_time_prospect!
    end
  end
end
