module Clinic
  module PatientPortal
    class AppointmentRequest < ApplicationRecord
      self.table_name = "clinic_patient_portal_appointment_requests"
      include Clinic::TenantScoped
      include Clinic::Auditable

      enum :status, { pending: "pending", approved: "approved", declined: "declined", cancelled: "cancelled" }, validate: true

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :identity, class_name: "Clinic::PatientPortal::Identity"
      belongs_to :site, class_name: "Clinic::Site", optional: true
      belongs_to :visit_type, class_name: "Clinic::VisitType", optional: true

      scope :recent, -> { order(requested_at: :desc, id: :desc) }

      validates :request_key, presence: true, format: { with: /\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}\z/ }
      validates :requested_at, :starts_at, :ends_at, presence: true
      validates :review_note, length: { maximum: 1_000 }, allow_nil: true
      validate :positive_interval
      validate :records_belong_to_practice

      private

      def positive_interval
        errors.add(:ends_at, "must be after starts_at") if starts_at && ends_at && ends_at <= starts_at
      end

      def records_belong_to_practice
        { patient: patient, identity: identity, site: site, visit_type: visit_type }.each do |attribute, record|
          errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
        end
        errors.add(:patient, "must match the portal identity") if patient && identity && identity.patient_id != patient_id
      end
    end
  end
end
