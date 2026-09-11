module Clinic
  module PatientPortal
    class WaitlistReplyReceipt < ApplicationRecord
      self.table_name = "clinic_patient_portal_waitlist_reply_receipts"
      include Clinic::TenantScoped

      belongs_to :identity, class_name: "Clinic::PatientPortal::Identity"
      belongs_to :waitlist_entry, class_name: "Clinic::Scheduling::WaitlistEntry"

      attr_readonly :practice_id, :identity_id, :waitlist_entry_id, :request_key, :operation_code,
        :payload_digest, :digest_algorithm, :digest_key_id, :created_at, :updated_at

      validates :request_key, format: { with: Clinic::Idempotency::KEY_PATTERN }
      validates :operation_code, inclusion: { in: %w[patient_portal.waitlist.accept patient_portal.waitlist.decline] }
      validates :payload_digest, format: { with: /\A[0-9a-f]{64}\z/ }
      validates :digest_algorithm, inclusion: { in: [ "hmac-sha256-v1" ] }
      validates :digest_key_id, presence: true, length: { maximum: 120 }
      validate :records_belong_to_practice

      before_update { throw :abort }
      before_destroy { throw :abort }

      private

      def records_belong_to_practice
        { identity: identity, waitlist_entry: waitlist_entry }.each do |attribute, record|
          errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
        end
      end
    end
  end
end
