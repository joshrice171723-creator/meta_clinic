module Clinic
  module Telehealth
    class Participant < ApplicationRecord
      self.table_name = "clinic_telehealth_participants"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :visit, class_name: "Clinic::Telehealth::Visit"
      belongs_to :portal_identity, class_name: "Clinic::PatientPortal::Identity", optional: true
      belongs_to :membership, class_name: "Clinic::Membership", optional: true
      belongs_to :admitted_by_membership, class_name: "Clinic::Membership", optional: true
      belongs_to :admitted_checkin, class_name: "Clinic::Telehealth::Checkin", optional: true
      has_many :consents, class_name: "Clinic::Telehealth::Consent", dependent: :restrict_with_error
      has_many :join_grants, class_name: "Clinic::Telehealth::JoinGrant", dependent: :restrict_with_error

      enum :role, { patient: "patient", clinician: "clinician", assistant: "assistant" }, validate: true
      enum :status, { eligible: "eligible", waiting: "waiting", admitted: "admitted", left: "left", removed: "removed" },
        validate: true
      scope :active_record, -> { where(revoked_at: nil).where.not(status: "removed") }
      before_validation :assign_provider_subject_id, on: :create
      validates :provider_subject_id, presence: true, uniqueness: true
      validate :identity_matches_role

      private

      def assign_provider_subject_id
        self.provider_subject_id ||= SecureRandom.uuid
      end

      def identity_matches_role
        valid = patient? ? portal_identity_id.present? && membership_id.nil? : membership_id.present? && portal_identity_id.nil?
        errors.add(:role, "does not match the participant identity") unless valid
        if patient? && portal_identity && (portal_identity.practice_id != practice_id || portal_identity.patient_id != visit&.patient_id)
          errors.add(:portal_identity, "must match the visit patient")
        end
      end
    end
  end
end
