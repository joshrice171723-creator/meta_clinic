module Clinic
  module Care
    class ClinicalPlanLink < ApplicationRecord
      self.table_name = "clinic_clinical_plan_links"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      SOURCE_KINDS = %w[medication_request service_request].freeze
      TARGET_KINDS = %w[medication_statement medication_administration lab_report procedure document].freeze

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter"
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership"
      belongs_to :medication_request_revision, class_name: "Clinic::Care::MedicationRequestRevision", optional: true
      belongs_to :service_request_revision, class_name: "Clinic::Care::ServiceRequestRevision", optional: true
      belongs_to :medication_statement, class_name: "Clinic::Care::MedicationStatement", optional: true
      belongs_to :medication_administration, class_name: "Clinic::Care::MedicationAdministration", optional: true
      belongs_to :lab_report, class_name: "Clinic::Care::LabReport", optional: true
      belongs_to :procedure_revision, class_name: "Clinic::Care::ProcedureRevision", optional: true
      belongs_to :document, class_name: "Clinic::Document", optional: true

      encrypts :outcome_summary
      validates :source_kind, inclusion: { in: SOURCE_KINDS }
      validates :target_kind, inclusion: { in: TARGET_KINDS }
      validates :recorded_at, presence: true
      validates :request_key, format: { with: Clinic::Idempotency::KEY_PATTERN },
        uniqueness: { scope: %i[practice_id recorded_by_membership_id] }
      validates :outcome_summary, length: { maximum: 2_000 }, allow_nil: true
    end
  end
end
