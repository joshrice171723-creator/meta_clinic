module Clinic
  module Assistant
    class BookingProposal < ApplicationRecord
      self.table_name = "clinic_assistant_booking_proposals"

      STATES = %w[pending confirmed expired invalidated conflicted].freeze

      belongs_to :practice, class_name: "Clinic::Practice"
      belongs_to :assistant_context, class_name: "Clinic::Assistant::Context"
      belongs_to :actor_user, class_name: "User"
      belongs_to :membership, class_name: "Clinic::Membership"
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :visit_type, class_name: "Clinic::VisitType"
      belongs_to :booked_clinician, class_name: "Clinic::ClinicianProfile"
      belongs_to :room, class_name: "Clinic::Room", optional: true
      belongs_to :appointment, class_name: "Clinic::Appointment", optional: true

      validates :public_id, :status, :visit_modality, :starts_at, :ends_at, :expires_at, presence: true
      validates :public_id, uniqueness: true
      validates :status, inclusion: { in: STATES }
      validate :confirmation_fields_match_state

      private

      def confirmation_fields_match_state
        confirmed = status == "confirmed"
        errors.add(:confirmed_at, "must match confirmation state") unless confirmed == confirmed_at.present?
        errors.add(:appointment, "must match confirmation state") unless confirmed == appointment_id.present?
      end
    end
  end
end
