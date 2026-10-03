module Clinic
  class ReferralReceipt < ApplicationRecord
    self.table_name = "clinic_referral_receipts"
    include TenantScoped
    include AppendOnly
    encrypts :details
    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :site, class_name: "Clinic::Site"
    belongs_to :service_offering, class_name: "Clinic::ServiceOffering"
    belongs_to :recorded_by, class_name: "User"
    belongs_to :prior_receipt, class_name: "Clinic::ReferralReceipt", optional: true
    validates :state, inclusion: { in: %w[received withdrawn] }
    validates :details, presence: true
    validates :request_key, format: { with: Clinic::Idempotency::KEY_PATTERN }
    validate :matching_context

    private

    def matching_context
      [ patient, site, service_offering, prior_receipt ].compact.each do |record|
        errors.add(:base, "Referral records must belong to this clinic.") unless record.practice_id == practice_id
      end
      if prior_receipt && [ prior_receipt.patient_id, prior_receipt.site_id, prior_receipt.service_offering_id ] != [ patient_id, site_id, service_offering_id ]
        errors.add(:prior_receipt, "must belong to the same patient, location and service")
      end
    end
  end
end
