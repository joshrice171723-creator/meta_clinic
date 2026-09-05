module Clinic
  module Care
    module SubscriptionAccess
      def self.authorize!(agreement:, actor:)
        return if actor.active? && Clinic::PatientPortal::Identity.available.exists?(user_id: actor.id, practice_id: agreement.practice_id, patient_id: agreement.patient_id)
        Clinic::Authorization.authorize_with_legacy!(practice: agreement.practice, actor: actor, action: "billing.payment_record", legacy_action: "billing.write")
      end
    end
  end
end
