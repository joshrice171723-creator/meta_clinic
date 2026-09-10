module Clinic
  module Care
    class EncounterHandoff < ApplicationRecord
      self.table_name = "clinic_encounter_handoffs"
      include Clinic::TenantScoped
      include Clinic::Auditable

      STATES = %w[pending accepted rejected correction_requested completed].freeze
      ACTIVE_STATES = %w[pending accepted correction_requested].freeze

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter"
      belongs_to :intake_revision, class_name: "Clinic::Care::EncounterIntakeRevision"
      belongs_to :requested_by_membership, class_name: "Clinic::Membership"
      belongs_to :requested_to_membership, class_name: "Clinic::Membership"
      belongs_to :accepted_by_membership, class_name: "Clinic::Membership", optional: true
      has_many :events, class_name: "Clinic::Care::EncounterHandoffEvent", dependent: :restrict_with_error

      validates :state, inclusion: { in: STATES }
      validate :context_matches
      validate :state_evidence_matches

      private

      def context_matches
        records = [ patient, encounter, intake_revision, requested_by_membership, requested_to_membership, accepted_by_membership ].compact
        errors.add(:base, "Handoff context must belong to one practice") if records.any? { |record| record.practice_id != practice_id }
        errors.add(:base, "Handoff must belong to this patient and encounter") if encounter && encounter.patient_id != patient_id
        if intake_revision && (intake_revision.patient_id != patient_id || intake_revision.encounter_id != encounter_id)
          errors.add(:intake_revision, "must belong to this encounter")
        end
      end

      def state_evidence_matches
        needs_acceptance = state.in?(%w[accepted completed])
        errors.add(:accepted_by_membership, "is required") if needs_acceptance && !accepted_by_membership
        errors.add(:accepted_by_membership, "is not allowed") if !needs_acceptance && accepted_by_membership
        needs_resolution = state.in?(%w[rejected completed])
        errors.add(:resolved_at, "is required") if needs_resolution && !resolved_at
        errors.add(:resolved_at, "is not allowed") if !needs_resolution && resolved_at
      end
    end
  end
end
