module Clinic
  class EncounterIntakeRevision < ApplicationRecord
    self.table_name = "clinic_encounter_intake_revisions"
    include TenantScoped
    include AppendOnly
    encrypts :encrypted_questionnaire
    validates :encrypted_questionnaire, length: { maximum: Clinic::Care::PrevisitNote::MAX_TEXT_LENGTH }, allow_nil: true

    STATES = %w[incomplete ready_for_handoff unable_to_complete].freeze
    IDENTITY_STATES = %w[confirmed not_confirmed unable_to_confirm].freeze
    REASON_STATES = %w[confirmed needs_correction not_recorded unable_to_obtain].freeze
    HISTORY_STATES = %w[reviewed incomplete not_recorded unable_to_obtain].freeze
    VITALS_STATES = %w[recorded incomplete not_recorded declined unable_to_obtain not_applicable].freeze

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :encounter, class_name: "Clinic::Encounter"
    belongs_to :recorded_by_membership, class_name: "Clinic::Membership"
    has_many :observation_refs, class_name: "Clinic::EncounterIntakeObservationRef",
      foreign_key: :intake_revision_id, dependent: :restrict_with_error
    has_many :history_refs, class_name: "Clinic::EncounterIntakeHistoryRef",
      foreign_key: :intake_revision_id, dependent: :restrict_with_error

    validates :version_number, numericality: { only_integer: true, greater_than: 0 }
    validates :status, inclusion: { in: STATES }
    validates :identity_state, inclusion: { in: IDENTITY_STATES }
    validates :visit_reason_state, inclusion: { in: REASON_STATES }
    validates :history_state, inclusion: { in: HISTORY_STATES }
    validates :vitals_state, inclusion: { in: VITALS_STATES }
    validates :request_key, :content_digest, :recorded_at, presence: true
    validates :request_key, length: { maximum: 160 }, uniqueness: { scope: :practice_id }
    validates :content_digest, format: { with: /\A[0-9a-f]{64}\z/ }
    validate :context_matches

    private

    def context_matches
      errors.add(:patient, "must belong to this practice") if patient && patient.practice_id != practice_id
      if encounter && (encounter.practice_id != practice_id || encounter.patient_id != patient_id)
        errors.add(:encounter, "must belong to this patient and practice")
      end
      if recorded_by_membership && recorded_by_membership.practice_id != practice_id
        errors.add(:recorded_by_membership, "must belong to this practice")
      end
    end
  end
end
