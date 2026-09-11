module Clinic
  class EncounterFollowUp < ApplicationRecord
    self.table_name = "clinic_encounter_follow_ups"
    include TenantScoped
    include Auditable

    SOURCES = %w[in_person telehealth].freeze
    STATES = %w[not_required needed arranged completed].freeze
    OPEN_STATES = %w[needed arranged].freeze

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :encounter, class_name: "Clinic::Encounter"
    belongs_to :follow_up_appointment, class_name: "Clinic::Appointment", optional: true
    belongs_to :assigned_to_membership, class_name: "Clinic::Membership", optional: true
    belongs_to :recorded_by_membership, class_name: "Clinic::Membership"
    belongs_to :updated_by_membership, class_name: "Clinic::Membership"
    belongs_to :completed_by_membership, class_name: "Clinic::Membership", optional: true
    has_many :recall_events, class_name: "Clinic::RecallEvent", foreign_key: :follow_up_id,
      dependent: :restrict_with_error, inverse_of: :follow_up

    encrypts :plan, :outcome

    scope :active, -> { where(state: OPEN_STATES) }
    validates :source_kind, inclusion: { in: SOURCES }
    validates :state, inclusion: { in: STATES }
    validates :plan, length: { maximum: 4_000 }
    validates :outcome, length: { maximum: 4_000 }
    validates :encounter_id, uniqueness: { scope: :practice_id }
    validate :canonical_links_match
    validate :state_evidence_matches

    def effective_state
      return "needed" if state == "arranged" && !follow_up_appointment&.status&.in?(%w[scheduled confirmed])

      state
    end

    def effective_follow_up_appointment
      follow_up_appointment if effective_state == "arranged"
    end

    private

    def canonical_links_match
      records = [ patient, encounter, follow_up_appointment, assigned_to_membership,
        recorded_by_membership, updated_by_membership, completed_by_membership ].compact
      errors.add(:base, "Every follow-up record must belong to the same practice") if records.any? {
        |record| record.practice_id != practice_id
      }
      errors.add(:encounter, "must belong to this patient") if encounter && encounter.patient_id != patient_id
      if follow_up_appointment
        errors.add(:follow_up_appointment, "must belong to this patient") if follow_up_appointment.patient_id != patient_id
        original_ends_at = encounter&.appointment&.ends_at || encounter&.ended_at || encounter&.started_at
        if original_ends_at && follow_up_appointment.starts_at <= original_ends_at
          errors.add(:follow_up_appointment, "must be after this encounter")
        end
      end
    end

    def state_evidence_matches
      if state == "arranged"
        errors.add(:follow_up_appointment, "is required for an arranged follow-up") unless follow_up_appointment
      elsif follow_up_appointment
        errors.add(:follow_up_appointment, "is only allowed for an arranged follow-up")
      end
      if state == "completed"
        errors.add(:outcome, "is required") if outcome.blank?
        errors.add(:completed_at, "is required") unless completed_at
        errors.add(:completed_by_membership, "is required") unless completed_by_membership
      elsif completed_at || completed_by_membership || outcome.present?
        errors.add(:base, "Completion evidence is only allowed for completed follow-up")
      end
    end
  end
end
