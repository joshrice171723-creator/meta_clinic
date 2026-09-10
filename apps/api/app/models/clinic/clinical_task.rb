module Clinic
  class ClinicalTask < ApplicationRecord
    self.table_name = "clinic_clinical_tasks"
    include TenantScoped
    include Auditable

    KINDS = %w[intake triage handoff order_execution result_follow_up patient_contact records_review].freeze
    STATUSES = %w[open in_progress blocked completed cancelled].freeze
    PRIORITIES = %w[routine time_sensitive].freeze
    SOURCE_TYPES = %w[workflow intake triage handoff medication_request service_request lab_report message document].freeze

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :encounter, class_name: "Clinic::Encounter"
    belongs_to :assigned_to_membership, class_name: "Clinic::Membership", optional: true
    belongs_to :created_by_membership, class_name: "Clinic::Membership"
    belongs_to :resolved_by_membership, class_name: "Clinic::Membership", optional: true

    validates :kind, inclusion: { in: KINDS }
    validates :status, inclusion: { in: STATUSES }
    validates :priority, inclusion: { in: PRIORITIES }
    validates :source_type, inclusion: { in: SOURCE_TYPES }
    validates :pool_code, presence: true, length: { maximum: 80 }
    validates :source_id, numericality: { only_integer: true, greater_than: 0 }
    validate :context_matches
    validate :resolution_matches

    private

    def context_matches
      records = [ patient, encounter, assigned_to_membership, created_by_membership, resolved_by_membership ].compact
      errors.add(:base, "Clinical task context must belong to one practice") if records.any? { |record| record.practice_id != practice_id }
      errors.add(:encounter, "must belong to this patient") if encounter && encounter.patient_id != patient_id
    end

    def resolution_matches
      resolved = status.in?(%w[completed cancelled])
      evidence = resolved_at && resolved_by_membership && resolution_code.present?
      errors.add(:base, "Resolved tasks require complete resolution evidence") if resolved && !evidence
      errors.add(:base, "Open tasks cannot carry resolution evidence") if !resolved && (resolved_at || resolved_by_membership || resolution_code.present?)
    end
  end
end
