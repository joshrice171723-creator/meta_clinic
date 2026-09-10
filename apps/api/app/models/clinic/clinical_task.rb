module Clinic
  class ClinicalTask < ApplicationRecord
    self.table_name = "clinic_clinical_tasks"
    include TenantScoped
    include Auditable

    KINDS = %w[intake handoff result_follow_up patient_call order_execution record_request].freeze
    STATES = %w[open claimed in_progress completed cancelled].freeze
    POOLS = %w[clinical front_desk records].freeze
    SOURCES = %w[manual encounter handoff lab_follow_up message reminder order].freeze
    RESOLUTIONS = %w[completed unable_to_complete no_action_needed superseded].freeze

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :encounter, class_name: "Clinic::Encounter", optional: true
    belongs_to :site, class_name: "Clinic::Site", optional: true
    belongs_to :assigned_to_membership, class_name: "Clinic::Membership", optional: true
    belongs_to :recorded_by_membership, class_name: "Clinic::Membership"
    belongs_to :completed_by_membership, class_name: "Clinic::Membership", optional: true

    validates :task_kind, inclusion: { in: KINDS }
    validates :state, inclusion: { in: STATES }
    validates :pool_code, inclusion: { in: POOLS }
    validates :source_type, inclusion: { in: SOURCES }
    validates :resolution_code, inclusion: { in: RESOLUTIONS }, allow_nil: true
    validate :context_matches
    validate :state_evidence_matches

    private

    def context_matches
      records = [ patient, encounter, site, assigned_to_membership, recorded_by_membership, completed_by_membership ].compact
      errors.add(:base, "Task context must belong to this practice") if records.any? { |record| record.practice_id != practice_id }
      errors.add(:encounter, "must belong to this patient") if encounter && encounter.patient_id != patient_id
      errors.add(:site, "must match the encounter site") if encounter && site && encounter.site_id != site_id
    end

    def state_evidence_matches
      if state == "completed"
        errors.add(:resolution_code, "is required") if resolution_code.blank?
        errors.add(:completed_by_membership, "is required") unless completed_by_membership
        errors.add(:completed_at, "is required") unless completed_at
      elsif resolution_code || completed_by_membership || completed_at
        errors.add(:base, "Completion evidence is only allowed for completed tasks")
      end
      if state.in?(%w[claimed in_progress]) && assigned_to_membership.nil?
        errors.add(:assigned_to_membership, "is required")
      end
    end
  end
end
