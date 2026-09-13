module Clinic
  module MembershipProspectSerializer
    def self.call(prospect)
      {
        id: prospect.id,
        status: prospect.status,
        relationship_stage: prospect.relationship_stage,
        display_name: prospect.display_name,
        email_address: prospect.email_address,
        phone_number: prospect.phone_number,
        source: prospect.source,
        outreach_consent: prospect.outreach_consent,
        intent_type: prospect.intent_type,
        account_activated_at: timestamp(prospect.account_activated_at),
        possible_duplicate: prospect.possible_duplicate?,
        subscription_version_id: prospect.subscription_version_id,
        selected_terms: prospect.selected_terms,
        patient_id: prospect.patient_id,
        portal_identity_id: prospect.portal_identity_id,
        agreement_id: prospect.agreement_id,
        receipt_id: prospect.receipt_id,
        onboarding_task_id: prospect.onboarding_task_id,
        checkout_status: prospect.checkout_status,
        paid_at: timestamp(prospect.paid_at),
        receipt_sent_at: timestamp(prospect.receipt_sent_at),
        reviewed_at: timestamp(prospect.reviewed_at),
        invited_at: timestamp(prospect.invited_at),
        converted_at: timestamp(prospect.converted_at),
        follow_up_state: prospect.follow_up_state,
        follow_up_assigned_to_membership_id: prospect.follow_up_assigned_to_membership_id,
        follow_up_due_at: timestamp(prospect.follow_up_due_at),
        follow_up_started_at: timestamp(prospect.follow_up_started_at),
        follow_up_attempted_at: timestamp(prospect.follow_up_attempted_at),
        follow_up_attempt_count: prospect.follow_up_attempt_count,
        follow_up_outcome: prospect.follow_up_outcome,
        created_at: timestamp(prospect.created_at),
        updated_at: timestamp(prospect.updated_at),
        lock_version: prospect.lock_version
      }
    end

    def self.timestamp(value)
      value&.iso8601(6)
    end
    private_class_method :timestamp
  end
end
