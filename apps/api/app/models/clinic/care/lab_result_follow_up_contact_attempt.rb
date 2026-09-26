module Clinic
  module Care
    class LabResultFollowUpContactAttempt < ApplicationRecord
      self.table_name = "clinic_lab_result_follow_up_contact_attempts"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      encrypts :note

      belongs_to :follow_up, class_name: "Clinic::Care::LabResultFollowUp"
      belongs_to :clinical_task, class_name: "Clinic::ClinicalTask"
      belongs_to :attempted_by_membership, class_name: "Clinic::Membership"

      METHODS = %w[portal phone in_person letter other].freeze
      OUTCOMES = %w[informed not_reached].freeze

      validates :contact_method, inclusion: { in: METHODS }
      validates :outcome, inclusion: { in: OUTCOMES }
      validates :attempted_at, :recorded_at, :request_key, presence: true
      validates :request_key, uniqueness: { scope: :practice_id }
      validates :note, length: { maximum: 1000 }
      validate :related_records_match

      private

      def related_records_match
        [ follow_up, clinical_task, attempted_by_membership ].compact.each do |record|
          errors.add(:base, "Contact attempt records must belong to this practice") if record.practice_id != practice_id
        end
        if follow_up && follow_up.patient_id != clinical_task&.patient_id
          errors.add(:clinical_task, "must belong to the follow-up patient")
        end
        if clinical_task && (clinical_task.source_type != "lab_follow_up" || clinical_task.source_id.to_i != id.to_i)
          errors.add(:clinical_task, "must reference this contact attempt")
        end
        if clinical_task && clinical_task.assigned_to_membership_id.nil?
          errors.add(:clinical_task, "must have an owner for its next action")
        end
      end
    end
  end
end
