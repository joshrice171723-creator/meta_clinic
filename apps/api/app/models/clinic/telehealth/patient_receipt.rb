module Clinic
  module Telehealth
    class PatientReceipt < ApplicationRecord
      self.table_name = "clinic_telehealth_patient_receipts"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :portal_identity, class_name: "Clinic::PatientPortal::Identity"
      belongs_to :visit, class_name: "Clinic::Telehealth::Visit"
      enum :outcome, { committed: "committed", outcome_unconfirmed: "outcome_unconfirmed" },
        prefix: true, validate: true
      validates :request_key, :operation_code, :digest_key_id, presence: true
      validates :payload_digest, format: { with: /\A\h{64}\z/ }
      validates :digest_algorithm, inclusion: { in: %w[HMAC-SHA256] }
      validates :result_kind, inclusion: { in: %w[checkin consent participant visit] }
    end
  end
end
