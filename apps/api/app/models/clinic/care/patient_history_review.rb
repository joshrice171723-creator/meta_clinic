module Clinic
  module Care
    class PatientHistoryReview < ApplicationRecord
      self.table_name = "clinic_patient_history_reviews"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter"
      belongs_to :reviewer_membership, class_name: "Clinic::Membership"

      enum :topic, { allergies: "allergies", medications: "medications", care_needs: "care_needs" }, prefix: true, validate: true
      enum :outcome, {
        current_list_confirmed: "current_list_confirmed", none_reported: "none_reported",
        follow_up_needed: "follow_up_needed", unable_to_obtain: "unable_to_obtain"
      }, prefix: true, validate: true
      enum :information_source, {
        patient: "patient", caregiver: "caregiver", clinician: "clinician",
        external_record: "external_record", other: "other"
      }, prefix: true, validate: true

      encrypts :notes

      scope :latest_first, -> { order(reviewed_at: :desc, id: :desc) }
      scope :reviewed_at_or_before, ->(at) { where("reviewed_at <= ?", at) }

      validates :patient, :encounter, :topic, :outcome, :information_source,
        :reviewer_membership, :reviewed_at, :request_key, presence: true
      validates :notes, length: { maximum: 2_000 }, allow_nil: true
      validates :request_key, length: { maximum: 120 }, uniqueness: { scope: :practice_id }
      validate :related_records_belong_to_context

      private

      def related_records_belong_to_context
        [ encounter, reviewer_membership ].compact.each do |record|
          errors.add(:base, "History review context must belong to this practice") if record.practice_id != practice_id
        end
        errors.add(:encounter, "must belong to this patient") if encounter && encounter.patient_id != patient_id
      end
    end
  end
end
