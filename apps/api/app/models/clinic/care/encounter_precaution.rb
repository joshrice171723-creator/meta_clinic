module Clinic
  module Care
    class EncounterPrecaution < ApplicationRecord
      self.table_name = "clinic_encounter_precautions"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter"
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership"
      belongs_to :reassessed_by_membership, class_name: "Clinic::Membership", optional: true

      enum :precaution_type, {
        contact: "contact", droplet: "droplet", airborne: "airborne", protective: "protective", other: "other"
      }, prefix: true, validate: true
      enum :evidence_status, { suspected: "suspected", confirmed: "confirmed" }, prefix: true, validate: true
      enum :status, { active: "active", discontinued: "discontinued", entered_in_error: "entered_in_error" }, prefix: true, validate: true

      encrypts :instructions
      attr_readonly :practice_id, :patient_id, :encounter_id, :recorded_by_membership_id, :recorded_at

      scope :active_for_summary, -> { where(status: :active).order(:recorded_at, :id) }
      scope :recorded_at_or_before, ->(at) { where("recorded_at <= ?", at) }

      validates :patient, :encounter, :precaution_type, :evidence_status, :status,
        :recorded_by_membership, :recorded_at, presence: true
      validates :instructions, length: { maximum: 2_000 }, allow_nil: true
      validates :lock_version, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
      validates :ended_at, comparison: { greater_than_or_equal_to: :recorded_at }, allow_nil: true
      validate :reassessment_pair_is_complete
      validate :discontinued_has_end
      validate :related_records_belong_to_context

      private

      def reassessment_pair_is_complete
        return if last_reassessed_at.present? == reassessed_by_membership.present?

        errors.add(:last_reassessed_at, "and reassessor must be recorded together")
      end

      def discontinued_has_end
        errors.add(:ended_at, "is required when a precaution is discontinued") if status_discontinued? && ended_at.nil?
      end

      def related_records_belong_to_context
        [ encounter, recorded_by_membership, reassessed_by_membership ].compact.each do |record|
          errors.add(:base, "Precaution context must belong to this practice") if record.practice_id != practice_id
        end
        errors.add(:encounter, "must belong to this patient") if encounter && encounter.patient_id != patient_id
      end
    end
  end
end
