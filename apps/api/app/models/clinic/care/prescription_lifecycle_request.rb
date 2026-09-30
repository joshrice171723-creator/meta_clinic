module Clinic
  module Care
    class PrescriptionLifecycleRequest < ApplicationRecord
      self.table_name = "clinic_prescription_lifecycle_requests"
      include Clinic::TenantScoped
      include Clinic::Auditable

      ACTIONS = %w[cancel fill_notice].freeze
      SCHEMA_VERSION = "local-prescription-lifecycle-v1".freeze
      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :medication_request_revision, class_name: "Clinic::Care::MedicationRequestRevision"
      belongs_to :transmission_attempt, class_name: "Clinic::Care::PrescriptionTransmissionAttempt"
      belongs_to :requested_by_membership, class_name: "Clinic::Membership"
      has_many :response_events, class_name: "Clinic::Care::PrescriptionResponseEvent", foreign_key: :lifecycle_request_id

      validates :action, inclusion: { in: ACTIONS }
      validates :request_key, :requested_at, :correlation_id, :attempt_correlation_id, presence: true
      validates :request_key, uniqueness: { scope: :practice_id }
      validates :schema_version, inclusion: { in: [ SCHEMA_VERSION ] }
      validate do
        attempt = transmission_attempt
        errors.add(:transmission_attempt, "must retain the original simulated prescription identity") unless attempt &&
          attempt.practice_id == practice_id && attempt.patient_id == patient_id &&
          attempt.medication_request_revision_id == medication_request_revision_id &&
          attempt.source == "simulation" && attempt.correlation_id.present? && attempt.correlation_id == attempt_correlation_id
        errors.add(:requested_by_membership, "must belong to this clinic") unless requested_by_membership&.practice_id == practice_id
      end
      before_update { throw :abort }
      before_destroy { throw :abort }
    end
  end
end
