module Clinic
  module Scheduling
    class WaitlistEntry < ApplicationRecord
      self.table_name = "clinic_waitlist_entries"
      include Clinic::TenantScoped
      include Clinic::Auditable
      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :clinician, class_name: "Clinic::ClinicianProfile"
      belongs_to :visit_type, class_name: "Clinic::VisitType"
      belongs_to :appointment, class_name: "Clinic::Appointment", optional: true
      encrypts :reason
      validates :state, inclusion: { in: %w[waiting offered booked cancelled] }
      validates :duration_minutes, numericality: { only_integer: true, greater_than_or_equal_to: 5, less_than_or_equal_to: 240 }
      validates :reason, length: { maximum: 500 }
      validate :context_matches

      def effective_state(at: Current.business_time)
        return "expired" if state == "offered" && offer_expires_at && offer_expires_at <= at
        return "expired" if state == "waiting" && latest_at <= at
        state
      end

      private

      def context_matches
        errors.add(:base, "Waitlist context must belong to one practice.") if [patient, site, clinician, visit_type, appointment].compact.any? { |item| item.practice_id != practice_id }
        errors.add(:appointment, "must belong to this patient") if appointment && appointment.patient_id != patient_id
        errors.add(:latest_at, "must follow the earliest time") unless earliest_at && latest_at && latest_at > earliest_at
      end
    end
  end
end
