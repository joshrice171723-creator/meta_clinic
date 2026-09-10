module Clinic
  module Care
    class LabResultFollowUp < ApplicationRecord
      self.table_name = "clinic_lab_result_follow_ups"
      include Clinic::TenantScoped
      include Clinic::Auditable

      STATES = %w[open completed not_required superseded].freeze
      IMMUTABLE_ATTRIBUTES = %w[
        practice_id patient_id lab_report_id lab_report_version_id instructions priority due_at escalated_at
        escalated_by_membership_id recorded_by_membership_id recorded_at
      ].freeze

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :lab_report, class_name: "Clinic::Care::LabReport"
      belongs_to :lab_report_version, class_name: "Clinic::Care::LabReportVersion", inverse_of: :follow_up
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership"
      belongs_to :completed_by_membership, class_name: "Clinic::Membership", optional: true
      belongs_to :escalated_by_membership, class_name: "Clinic::Membership", optional: true

      enum :state, STATES.index_with(&:itself), prefix: true, validate: true
      attr_readonly(*IMMUTABLE_ATTRIBUTES)

      validates :patient, :lab_report, :lab_report_version, :state, :recorded_by_membership, :recorded_at, presence: true
      validates :lab_report_version_id, uniqueness: { scope: %i[practice_id patient_id lab_report_id] }
      validates :instructions, length: { in: 1..1000 }, allow_nil: true
      validates :outcome, length: { in: 1..1000 }, allow_nil: true
      validates :priority, inclusion: { in: %w[routine urgent critical] }
      validates :patient_contact_status, inclusion: { in: %w[informed not_reached not_required] }, allow_nil: true
      validates :patient_contact_method, inclusion: { in: %w[portal phone in_person letter other] }, allow_nil: true
      validate :related_records_belong_to_context
      validate :state_evidence_is_complete
      validate :escalation_evidence_is_complete
      before_update :allow_terminal_transition_only
      before_destroy { throw :abort }

      scope :open_oldest_first, -> { state_open.order(recorded_at: :asc, id: :asc) }

      private

      def related_records_belong_to_context
        errors.add(:patient, "must belong to this practice") if patient && patient.practice_id != practice_id
        if lab_report && (lab_report.practice_id != practice_id || lab_report.patient_id != patient_id)
          errors.add(:lab_report, "must belong to this patient and practice")
        end
        if lab_report_version && (
          lab_report_version.practice_id != practice_id || lab_report_version.patient_id != patient_id ||
            lab_report_version.lab_report_id != lab_report_id
        )
          errors.add(:lab_report_version, "must belong to this patient lab report")
        end
        [ recorded_by_membership, completed_by_membership, escalated_by_membership ].compact.each do |membership|
          errors.add(:base, "Lab result follow-up staff must belong to this practice") if membership.practice_id != practice_id
        end
      end

      def state_evidence_is_complete
        case state
        when "open"
          errors.add(:instructions, "are required") if instructions.blank?
          errors.add(:base, "Open follow-up cannot have terminal evidence") if outcome || completed_at || completed_by_membership || superseded_at
        when "completed"
          errors.add(:instructions, "are required") if instructions.blank?
          errors.add(:outcome, "is required") if outcome.blank?
          unless completed_at && completed_by_membership && superseded_at.nil?
            errors.add(:base, "Completed follow-up evidence is incomplete")
          end
          errors.add(:patient_contact_status, "is required for a critical result") if priority == "critical" && patient_contact_status.blank?
          if patient_contact_status.present? && patient_contact_status != "not_required" && patient_contact_at.nil?
            errors.add(:patient_contact_at, "is required when patient contact is attempted")
          end
          errors.add(:patient_contact_method, "is required when the patient is informed") if patient_contact_status == "informed" && patient_contact_method.blank?
        when "not_required"
          if outcome || completed_at || completed_by_membership || superseded_at
            errors.add(:base, "Not-required follow-up cannot have terminal evidence")
          end
        when "superseded"
          errors.add(:instructions, "are required") if instructions.blank?
          if outcome || completed_at || completed_by_membership || superseded_at.nil?
            errors.add(:base, "Superseded follow-up evidence is incomplete")
          end
        end
      end

      def escalation_evidence_is_complete
        return if priority == "routine" && due_at.nil? && escalated_at.nil? && escalated_by_membership.nil?
        return if priority.in?(%w[urgent critical]) && due_at && escalated_at && escalated_by_membership

        errors.add(:base, "Urgent and critical follow-ups require a due time and escalation evidence")
      end

      def allow_terminal_transition_only
        immutable_change = IMMUTABLE_ATTRIBUTES.any? { |attribute| will_save_change_to_attribute?(attribute) }
        transition = state_was == "open" && state.in?(%w[completed superseded]) && will_save_change_to_state?
        return if transition && !immutable_change

        errors.add(:base, "Lab result follow-up evidence is immutable")
        throw :abort
      end
    end
  end
end
