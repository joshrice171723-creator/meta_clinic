module Clinic
  module MembershipGrowth
    class StaffEnrollment
      Result = Struct.new(:prospect, :replayed, keyword_init: true)

      def self.call(practice:, actor:, version_id:, selections:, display_name:, email_address:, phone_number:,
        contact_consent:, request_key:)
        reviewer = Clinic::Authorization.authorize!(practice:, actor:, action: "subscriptions.review")
        raise ArgumentError, "Confirm that the prospective patient agrees the clinic may contact them about this enrollment." unless
          contact_consent == true

        ApplicationRecord.transaction do
          captured = CaptureProspect.call(
            practice:,
            version_id:,
            selections:,
            display_name:,
            email_address:,
            phone_number:,
            source: "front_desk_enrollment",
            outreach_consent: true,
            request_key:,
            intent_type: "purchase",
            require_storefront: false
          )
          prospect = captured.prospect
          unless captured.replayed
            prospect.update!(follow_up_state: "open", follow_up_due_at: Current.business_time)
            Clinic::AuditRecorder.record!(
              practice:,
              actor:,
              action_code: "membership_prospects.staff_enrollment",
              outcome: :committed,
              resource_version_ref: "membership_prospect:#{prospect.id}"
            )
          end
          Result.new(prospect:, replayed: captured.replayed)
        end
      end
    end
  end
end
