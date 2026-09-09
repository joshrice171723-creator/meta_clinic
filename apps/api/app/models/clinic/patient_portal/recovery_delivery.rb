module Clinic
  module PatientPortal
    class RecoveryDelivery < ApplicationRecord
      self.table_name = "clinic_patient_portal_recovery_deliveries"
      include Clinic::TenantScoped

      enum :status, {
        pending: "pending",
        leased: "leased",
        accepted: "accepted",
        failed: "failed",
        unknown: "unknown",
        gated: "gated",
        expired: "expired",
        cancelled: "cancelled"
      }, validate: true

      belongs_to :identity, class_name: "Clinic::PatientPortal::Identity"
      belongs_to :patient_contact, class_name: "Clinic::Care::PatientContact"

      encrypts :token

      validates :requested_at, :available_at, :expires_at, presence: true
      validates :token, presence: true, if: -> { pending? || leased? }
      validates :provider, inclusion: { in: %w[twilio] }
      validates :attempt_count, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 1 }
      validates :lease_token_digest, format: { with: /\A\h{64}\z/ }, allow_nil: true
      validates :provider_message_id, format: { with: /\ASM\h{32}\z/ }, allow_nil: true
      validate :relationships_belong_to_practice

      private

      def relationships_belong_to_practice
        errors.add(:identity, "must belong to this practice") if identity && identity.practice_id != practice_id
        if patient_contact && (patient_contact.practice_id != practice_id || patient_contact.patient_id != identity&.patient_id)
          errors.add(:patient_contact, "must belong to this patient and practice")
        end
      end
    end
  end
end
