module Clinic
  module Care
    class PrescriptionEvent < ApplicationRecord
      self.table_name = "clinic_prescription_events"
      include Clinic::TenantScoped
      include Clinic::Auditable
      belongs_to :medication_request_revision, class_name: "Clinic::Care::MedicationRequestRevision"
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership"
      belongs_to :prior_event, class_name: name, optional: true
      encrypts :note
      validates :kind, inclusion: { in: %w[review failure_before_send rejected acknowledged unknown accepted unavailable revoked duplicate outcome_unknown cancelled confirmed_not_sent] }
      validates :source, inclusion: { in: %w[manual simulation] }
      validates :request_key, :recorded_at, presence: true
      validates :note, length: { maximum: 2000 }
      validate do
        order = medication_request_revision
        errors.add(:base, "Prescription event context mismatch") unless order && order.practice_id == practice_id && order.patient_id == patient_id && recorded_by_membership&.practice_id == practice_id
        if prior_event && (prior_event.practice_id != practice_id || prior_event.patient_id != patient_id || prior_event.medication_request_revision.series_id != order&.series_id)
          errors.add(:prior_event, "must belong to this prescription")
        end
      end
      before_update { throw :abort }
      before_destroy { throw :abort }
    end
  end
end
