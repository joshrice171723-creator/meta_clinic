module Clinic
  module MembershipGrowth
    class StaffAssistedCheckout
      Result = Struct.new(:prospect, :checkout_url, keyword_init: true)

      def self.call(practice:, actor:, prospect_id:, lock_version:, gateway: Clinic::Billing::StripeGateway.new)
        reviewer = Clinic::Authorization.authorize!(practice:, actor:, action: "subscriptions.review")
        prospect = prepare!(practice:, reviewer:, prospect_id:, lock_version:)
        checkout = PublicCheckout.start_for_prospect(practice:, prospect:, replayed: false, gateway:)
        prospect.with_lock do
          prospect.update!(follow_up_state: "waiting", follow_up_outcome: "checkout_opened",
            follow_up_due_at: Current.business_time + 1.day)
          Clinic::AuditRecorder.record!(practice:, actor:,
            action_code: "membership_prospects.assisted_checkout", outcome: :committed,
            resource_version_ref: "membership_prospect:#{prospect.id}")
        end
        Result.new(prospect: prospect.reload, checkout_url: checkout.checkout_url)
      end

      def self.prepare!(practice:, reviewer:, prospect_id:, lock_version:)
        version_text = lock_version.to_s
        unless version_text.match?(/\A\d+\z/)
          raise ArgumentError, "Lock version must be a non-negative integer."
        end
        expected_lock_version = version_text.to_i
        MembershipProspect.transaction do
          prospect = MembershipProspect.where(practice_id: practice.id).lock.find(prospect_id)
          raise ActiveRecord::StaleObjectError.new(prospect, "update") unless prospect.lock_version == expected_lock_version
          unless prospect.intent_type == "purchase" && prospect.follow_up_state == "in_progress" &&
              prospect.follow_up_assigned_to_membership_id == reviewer.id &&
              prospect.status.in?(%w[checkout_pending checkout_expired payment_failed])
            raise TransitionProspect::InvalidTransition,
              "Start the signup call before preparing secure payment."
          end
          if prospect.status.in?(%w[checkout_expired payment_failed])
            prospect.update!(checkout_reference: nil, checkout_session_id: nil, checkout_status: nil,
              checkout_account_id: nil, checkout_mode: nil, application_fee_cents: nil)
          end
          prospect
        end
      end
      private_class_method :prepare!
    end
  end
end
