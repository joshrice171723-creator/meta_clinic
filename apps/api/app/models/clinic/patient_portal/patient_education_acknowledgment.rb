module Clinic
  module PatientPortal
    class PatientEducationAcknowledgment < ApplicationRecord
      self.table_name = "clinic_patient_education_acknowledgments"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      SOURCES = %w[patient_portal].freeze

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :education_event, class_name: "Clinic::Care::PatientEducationEvent"
      belongs_to :identity, class_name: "Clinic::PatientPortal::Identity"
      belongs_to :user

      validates :request_key, presence: true, format: { with: Clinic::Idempotency::KEY_PATTERN },
        uniqueness: { scope: %i[practice_id user_id] }
      validates :source, inclusion: { in: SOURCES }
      validates :acknowledged_at, presence: true
      validates :education_event_id, uniqueness: { scope: %i[practice_id user_id] }
      validate :context_matches

      private

      def context_matches
        records = [ patient, education_event, identity ].compact
        errors.add(:base, "Acknowledgment records must remain in one practice") if records.any? { |record| record.practice_id != practice_id }
        errors.add(:education_event, "must belong to this patient") if education_event && education_event.patient_id != patient_id
        errors.add(:identity, "must belong to this patient") if identity && identity.patient_id != patient_id
        errors.add(:user, "must match the portal identity") if identity && identity.user_id != user_id
        if education_event && education_event.delivery_method != "portal"
          errors.add(:education_event, "must be a portal-delivered material")
        end
      end
    end
  end
end
