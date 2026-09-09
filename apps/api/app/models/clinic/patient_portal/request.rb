module Clinic
  module PatientPortal
    class Request < ApplicationRecord
      self.table_name = "clinic_patient_portal_requests"
      include Clinic::TenantScoped
      include Clinic::Auditable

      enum :request_type, { message: "message", refill: "refill" }, validate: true
      enum :status, { pending: "pending", in_review: "in_review", resolved: "resolved", declined: "declined" }, validate: true

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :identity, class_name: "Clinic::PatientPortal::Identity"

      encrypts :content, :review_note

      scope :recent, -> { order(requested_at: :desc, id: :desc) }

      validates :request_key, presence: true, format: { with: /\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}\z/ }
      validates :content_digest, presence: true, length: { is: 64 }, format: { with: /\A\h{64}\z/ }
      validates :requested_at, :content, presence: true
      validates :review_note, length: { maximum: 1_000 }, allow_nil: true
      validate :records_belong_to_practice

      private

      def records_belong_to_practice
        { patient: patient, identity: identity }.each do |attribute, record|
          errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
        end
        errors.add(:patient, "must match the portal identity") if patient && identity && identity.patient_id != patient_id
      end
    end
  end
end
