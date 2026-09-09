module Clinic
  class WorkingDraft < ApplicationRecord
    self.table_name = "clinic_working_drafts"
    include TenantScoped
    include Auditable

    belongs_to :actor_membership, class_name: "Clinic::Membership"
    belongs_to :patient, class_name: "Clinic::Care::Patient", optional: true
    belongs_to :encounter, class_name: "Clinic::Encounter", optional: true
    encrypts :encrypted_payload

    validates :kind, inclusion: { in: %w[registration patient_update appointment vitals soap checkout follow_up] }
    validates :context_key, presence: true, length: { maximum: 160 }
    validates :version, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
    validate :owned_context

    private

    def owned_context
      errors.add(:actor_membership, "must belong to this clinic") if actor_membership && actor_membership.practice_id != practice_id
      errors.add(:patient, "must belong to this clinic") if patient && patient.practice_id != practice_id
      if encounter && (encounter.practice_id != practice_id || encounter.patient_id != patient_id)
        errors.add(:encounter, "must belong to this patient and clinic")
      end
    end
  end
end
