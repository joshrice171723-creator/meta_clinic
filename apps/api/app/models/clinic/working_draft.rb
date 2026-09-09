module Clinic
  class WorkingDraft < ApplicationRecord
    self.table_name = "clinic_working_drafts"
    include TenantScoped

    belongs_to :actor_membership, class_name: "Clinic::Membership"
    belongs_to :patient, class_name: "Clinic::Care::Patient", optional: true
    belongs_to :encounter, class_name: "Clinic::Encounter", optional: true
    encrypts :encrypted_payload

    validates :kind, inclusion: { in: %w[registration patient_update appointment vitals soap checkout follow_up] }
    validates :context_key, presence: true, length: { maximum: 160 }
    validate :valid_draft_version
    validate :owned_context

    private

    def valid_draft_version
      value = self[:version]
      errors.add(:version, "must be a non-negative integer") unless value.is_a?(Integer) && value >= 0
    end

    def owned_context
      errors.add(:actor_membership, "must belong to this clinic") if actor_membership && actor_membership.practice_id != practice_id
      errors.add(:patient, "must belong to this clinic") if patient && patient.practice_id != practice_id
      if encounter && (encounter.practice_id != practice_id || encounter.patient_id != patient_id)
        errors.add(:encounter, "must belong to this patient and clinic")
      end
    end
  end
end
