module Clinic
  module Care
    class Allergy < ApplicationRecord
      self.table_name = "clinic_allergies"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership", optional: true
      belongs_to :reviewed_by_membership, class_name: "Clinic::Membership", optional: true

      enum :data_status, { incomplete: "incomplete", recorded: "recorded" }, prefix: true, validate: true
      enum :category, {
        food: "food", medication: "medication", environment: "environment", biologic: "biologic",
        other: "other", unknown: "unknown"
      }, prefix: true, validate: true
      enum :clinical_status, {
        active: "active", inactive: "inactive", resolved: "resolved", unknown: "unknown",
        entered_in_error: "entered_in_error"
      }, prefix: true, validate: true
      enum :verification_status, {
        unconfirmed: "unconfirmed", presumed: "presumed", confirmed: "confirmed", refuted: "refuted",
        entered_in_error: "entered_in_error"
      }, prefix: true, validate: true
      enum :criticality, { low: "low", high: "high", unable_to_assess: "unable_to_assess" }, prefix: true, validate: true
      enum :severity, { mild: "mild", moderate: "moderate", severe: "severe", unknown: "unknown" }, prefix: true, validate: true

      encrypts :allergen_name, :reaction
      attr_readonly :practice_id, :patient_id, :recorded_by_membership_id, :recorded_at

      scope :recorded_details, -> { where(data_status: :recorded) }
      scope :active_for_summary, -> { recorded_details.where(clinical_status: :active).order(:recorded_at, :id) }

      validates :patient_id, presence: true
      validates :allergen_name, :recorded_by_membership, :recorded_at, presence: true, if: :data_status_recorded?
      validates :allergen_name, length: { maximum: 400 }, allow_nil: true
      validates :reaction, length: { maximum: 2_000 }, allow_nil: true
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
          errors.add(:base, "Clinical record staff must belong to this practice") if membership.practice_id != practice_id
        end
      end
    end
  end
end
