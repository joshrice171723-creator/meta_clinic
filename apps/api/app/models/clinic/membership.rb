module Clinic
  class Membership < ApplicationRecord
    self.table_name = "clinic_memberships"
    include Clinic::TenantScoped
    include Clinic::Auditable
    has_many :legacy_notes, class_name: "Clinic::Care::Note", foreign_key: :author_id, primary_key: :user_id, dependent: :restrict_with_error
    has_many :note_revisions, class_name: "Clinic::EncounterNoteRevision", foreign_key: :author_membership_id, dependent: :restrict_with_error
    has_many :note_signatures, class_name: "Clinic::EncounterNoteSignature", foreign_key: :signer_membership_id, dependent: :restrict_with_error
    belongs_to :user
    has_one :clinician_profile, class_name: "Clinic::ClinicianProfile", dependent: :restrict_with_error
    has_many :encounter_participants, class_name: "Clinic::EncounterParticipant", dependent: :restrict_with_error
    has_many :recorded_allergies, class_name: "Clinic::Care::Allergy", foreign_key: :recorded_by_membership_id, dependent: :restrict_with_error
    has_many :recorded_medication_statements, class_name: "Clinic::Care::MedicationStatement", foreign_key: :recorded_by_membership_id, dependent: :restrict_with_error
    has_many :recorded_conditions, class_name: "Clinic::Care::Condition", foreign_key: :recorded_by_membership_id, dependent: :restrict_with_error
    has_many :recorded_care_needs, class_name: "Clinic::Care::PatientCareNeed", foreign_key: :recorded_by_membership_id, dependent: :restrict_with_error
    has_many :recorded_precautions, class_name: "Clinic::Care::EncounterPrecaution", foreign_key: :recorded_by_membership_id, dependent: :restrict_with_error
    has_many :patient_history_reviews, class_name: "Clinic::Care::PatientHistoryReview", foreign_key: :reviewer_membership_id, dependent: :restrict_with_error
    has_many :role_grants, class_name: "Clinic::RoleGrant", dependent: :restrict_with_error
    has_many :grant_events, class_name: "Clinic::RoleGrantEvent", foreign_key: :grantor_membership_id, dependent: :restrict_with_error
    validates :user_id, uniqueness: true
    validates :authorization_generation, numericality: { only_integer: true, greater_than: 0 }
    scope :active, -> { where(active: true) }
    before_update :bump_authorization_generation, if: :will_save_change_to_active?
    after_update :revoke_telehealth_access, if: -> { saved_change_to_active? && !active? }

    def advance_authorization_generation!
      increment!(:authorization_generation)
    end

    private

    def bump_authorization_generation
      self.authorization_generation += 1
    end

    def revoke_telehealth_access
      Clinic::Telehealth::RevokeMembershipAccess.call(membership: self, force: true)
    end
  end
end
