module Clinic
  module Care
    class MedicationStatement < ApplicationRecord
      self.table_name = "clinic_medication_statements"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership", optional: true
      belongs_to :reviewed_by_membership, class_name: "Clinic::Membership", optional: true

      enum :data_status, { incomplete: "incomplete", recorded: "recorded" }, prefix: true, validate: true
      enum :status, {
        active: "active", completed: "completed", on_hold: "on_hold", stopped: "stopped",
        not_taken: "not_taken", unknown: "unknown", entered_in_error: "entered_in_error"
      }, prefix: true, validate: true
      enum :information_source, {
        patient: "patient", caregiver: "caregiver", clinician: "clinician", external_record: "external_record",
        other: "other", unknown: "unknown"
      }, prefix: true, validate: true

      encrypts :medication_name, :dose_text, :route_text, :frequency_text, :purpose
      attr_readonly :practice_id, :patient_id, :recorded_by_membership_id, :recorded_at

      scope :recorded_details, -> { where(data_status: :recorded) }
      scope :active_for_summary, -> { recorded_details.where(status: :active).order(:recorded_at, :id) }

      validates :patient_id, presence: true
      validates :medication_name, :recorded_by_membership, :recorded_at, presence: true, if: :data_status_recorded?
      validates :medication_name, length: { maximum: 400 }, allow_nil: true
      validates :dose_text, :route_text, :frequency_text, length: { maximum: 400 }, allow_nil: true
      validates :purpose, length: { maximum: 2_000 }, allow_nil: true
      validates :lock_version, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
      validates :effective_until, comparison: { greater_than_or_equal_to: :effective_from }, allow_nil: true, if: :effective_from?
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
