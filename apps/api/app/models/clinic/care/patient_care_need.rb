module Clinic
  module Care
    class PatientCareNeed < ApplicationRecord
      self.table_name = "clinic_patient_care_needs"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership"
      belongs_to :reviewed_by_membership, class_name: "Clinic::Membership", optional: true

      enum :category, {
        communication: "communication", accessibility: "accessibility", mobility: "mobility", equipment: "equipment",
        decision_support: "decision_support", other: "other"
      }, prefix: true, validate: true
      enum :need_code, {
        spoken_language_interpreter: "spoken_language_interpreter",
        sign_language_interpreter: "sign_language_interpreter",
        hearing_assistance: "hearing_assistance", vision_assistance: "vision_assistance",
        communication_device: "communication_device", wheelchair_access: "wheelchair_access",
        transfer_assistance: "transfer_assistance", mobility_assistance: "mobility_assistance",
        service_animal: "service_animal", support_person: "support_person", cognitive_support: "cognitive_support",
        supplemental_oxygen: "supplemental_oxygen", other: "other"
      }, prefix: true, validate: true
      enum :status, { active: "active", inactive: "inactive", entered_in_error: "entered_in_error" }, prefix: true, validate: true

      encrypts :description, :instructions
      attr_readonly :practice_id, :patient_id, :recorded_by_membership_id, :recorded_at, :effective_from

      scope :active_at, ->(at = Time.current) {
        where(status: :active).where("effective_from <= ? AND (effective_until IS NULL OR effective_until > ?)", at, at)
      }

      validates :patient, :category, :need_code, :description, :status, :effective_from,
        :recorded_by_membership, :recorded_at, presence: true
      validates :description, length: { maximum: 400 }
      validates :instructions, length: { maximum: 2_000 }, allow_nil: true
      validates :effective_until, comparison: { greater_than: :effective_from }, allow_nil: true
      validates :lock_version, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
      validate :review_pair_is_complete
      validate :memberships_belong_to_practice

      private

      def review_pair_is_complete
        return if last_reviewed_at.present? == reviewed_by_membership.present?

        errors.add(:last_reviewed_at, "and reviewer must be recorded together")
      end

      def memberships_belong_to_practice
        [ recorded_by_membership, reviewed_by_membership ].compact.each do |membership|
          errors.add(:base, "Care-need staff must belong to this practice") if membership.practice_id != practice_id
        end
      end
    end
  end
end
