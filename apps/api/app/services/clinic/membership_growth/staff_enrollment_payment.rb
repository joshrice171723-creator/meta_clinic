module Clinic
  module MembershipGrowth
    class StaffEnrollmentPayment
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
    end
  end
end
