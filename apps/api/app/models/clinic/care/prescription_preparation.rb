module Clinic
  module Care
    class PrescriptionPreparation < ApplicationRecord
      self.table_name = "clinic_prescription_preparations"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :medication_request_revision, class_name: "Clinic::Care::MedicationRequestRevision"
      belongs_to :pharmacy_destination, class_name: "Clinic::Care::PharmacyDestination"
      belongs_to :review_event, class_name: "Clinic::Care::PrescriptionEvent"
      belongs_to :prepared_by_membership, class_name: "Clinic::Membership"
      has_one :submission_attempt, class_name: "Clinic::Care::PrescriptionTransmissionAttempt", foreign_key: :preparation_id

      validates :request_key, :prepared_at, presence: true
      validates :request_key, uniqueness: { scope: :practice_id }
      validates :schema_version, inclusion: { in: [ PrescriptionTransmissionAttempt::SCHEMA_VERSION ] }
      validates :mode, inclusion: { in: PrescriptionTransmissionAttempt::MODES }
      validates :payload_digest, format: { with: /\A[0-9a-f]{64}\z/ }
      validate :context_matches

      before_update { throw :abort }
      before_destroy { throw :abort }

      def context_matches
        order = medication_request_revision
        review = review_event
        errors.add(:medication_request_revision, "must match this patient and clinic") unless order &&
          order.practice_id == practice_id && order.patient_id == patient_id
        errors.add(:pharmacy_destination, "must belong to this clinic") unless pharmacy_destination&.practice_id == practice_id
        errors.add(:prepared_by_membership, "must belong to this clinic") unless prepared_by_membership&.practice_id == practice_id
        errors.add(:review_event, "must review this exact patient, clinic and revision") unless review &&
          review.practice_id == practice_id && review.patient_id == patient_id &&
          review.medication_request_revision_id == medication_request_revision_id && review.kind == "review" && review.source == "manual"
      end
    end
  end
end
