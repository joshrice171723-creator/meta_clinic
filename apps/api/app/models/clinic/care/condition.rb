module Clinic
  module Care
    class Condition < ApplicationRecord
      self.table_name = "clinic_conditions"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership", optional: true
      belongs_to :reviewed_by_membership, class_name: "Clinic::Membership", optional: true

      enum :data_status, { incomplete: "incomplete", recorded: "recorded" }, prefix: true, validate: true
      enum :clinical_status, {
        active: "active", inactive: "inactive", resolved: "resolved", unknown: "unknown",
        entered_in_error: "entered_in_error"
      }, prefix: true, validate: true
      enum :verification_status, {
        unconfirmed: "unconfirmed", provisional: "provisional", confirmed: "confirmed", refuted: "refuted",
        entered_in_error: "entered_in_error"
      }, prefix: true, validate: true

      encrypts :condition_name, :care_instruction
      attr_readonly :practice_id, :patient_id, :recorded_by_membership_id, :recorded_at

      scope :recorded_details, -> { where(data_status: :recorded) }
      scope :active_care_alerts, -> {
        recorded_details.where(clinical_status: :active, affects_current_care: true).order(:recorded_at, :id)
      }

      validates :patient_id, presence: true
      validates :condition_name, :recorded_by_membership, :recorded_at, presence: true, if: :data_status_recorded?
      validates :condition_name, length: { maximum: 400 }, allow_nil: true
      validates :care_instruction, length: { maximum: 2_000 }, allow_nil: true
      validates :affects_current_care, inclusion: { in: [ true, false ] }
      validates :lock_version, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
      validates :resolved_at, comparison: { greater_than_or_equal_to: :onset_at }, allow_nil: true, if: :onset_at?
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
