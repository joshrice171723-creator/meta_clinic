module Clinic
  module Telehealth
    class Visit < ApplicationRecord
      self.table_name = "clinic_telehealth_visits"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :appointment, class_name: "Clinic::Appointment"
      belongs_to :encounter, class_name: "Clinic::Encounter", optional: true
      belongs_to :policy_version, class_name: "Clinic::Telehealth::PolicyVersion"
      belongs_to :current_room_attempt, class_name: "Clinic::Telehealth::RoomAttempt", optional: true
      belongs_to :ended_by_membership, class_name: "Clinic::Membership", optional: true
      belongs_to :created_by_membership, class_name: "Clinic::Membership"
      belongs_to :scribe_encounter, class_name: "Clinic::Scribe::Encounter", optional: true
      belongs_to :scribe_capture_owner_participant, class_name: "Clinic::Telehealth::Participant", optional: true
      has_many :participants, class_name: "Clinic::Telehealth::Participant", dependent: :restrict_with_error
      has_many :checkins, class_name: "Clinic::Telehealth::Checkin", dependent: :restrict_with_error
      has_many :consents, class_name: "Clinic::Telehealth::Consent", dependent: :restrict_with_error
      has_many :room_attempts, class_name: "Clinic::Telehealth::RoomAttempt", dependent: :restrict_with_error
      has_many :join_grants, class_name: "Clinic::Telehealth::JoinGrant", dependent: :restrict_with_error
      has_many :commands, class_name: "Clinic::Telehealth::Command", dependent: :restrict_with_error

      enum :status, { scheduled: "scheduled", in_progress: "in_progress", ending: "ending", ended: "ended",
        cancelled: "cancelled", no_show: "no_show" }, validate: true
      before_validation :assign_public_id, on: :create
      validates :public_id, :access_generation, presence: true
      validates :public_id, uniqueness: true
      validates :access_generation, numericality: { only_integer: true, greater_than: 0 }
      validate :canonical_links_match

      def active_media?
        %w[in_progress ending].include?(status) || current_room_attempt&.status.in?(%w[pending provisioning ready active ending unknown])
      end

      private

      def assign_public_id
        self.public_id ||= SecureRandom.uuid
      end

      def canonical_links_match
        errors.add(:appointment, "must belong to the visit patient") if appointment && appointment.patient_id != patient_id
        if encounter && (encounter.patient_id != patient_id || encounter.appointment_id != appointment_id)
          errors.add(:encounter, "must match the visit patient and appointment")
        end
        if scribe_encounter && (scribe_encounter.patient_id != patient_id || scribe_encounter.clinical_encounter_id != encounter_id)
          errors.add(:scribe_encounter, "must match the visit encounter")
        end
      end
    end
  end
end
