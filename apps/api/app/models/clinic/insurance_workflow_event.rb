module Clinic
  class InsuranceWorkflowEvent < ApplicationRecord
    self.table_name = "clinic_insurance_workflow_events"
    include TenantScoped
    include AppendOnly

    encrypts :details
    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :site, class_name: "Clinic::Site"
    belongs_to :coverage_version, class_name: "Clinic::CoverageVersion"
    belongs_to :recorded_by, class_name: "User"
    belongs_to :invoice, class_name: "Clinic::Invoice", optional: true
    belongs_to :insurance_claim, class_name: "Clinic::InsuranceClaim", optional: true
    belongs_to :request_event, class_name: name, optional: true
    belongs_to :prior_event, class_name: name, optional: true

    validates :kind, inclusion: { in: %w[eligibility authorization claim reconciliation] }
    validates :state, inclusion: { in: %w[prepared pending approved denied unknown cancelled] }
    validates :source, inclusion: { in: %w[local manual simulation] }
    validates :request_key, format: { with: Clinic::Idempotency::KEY_PATTERN }
    validates :details, presence: true
    validate :matching_context

    def evidence
      JSON.parse(details)
    end

    private

    def matching_context
      [ coverage_version, invoice, insurance_claim, request_event, prior_event ].compact.each do |record|
        errors.add(:base, "Insurance records must share their clinic and patient.") unless record.practice_id == practice_id && record.patient_id == patient_id
      end
      errors.add(:site, "must belong to this clinic") if site && site.practice_id != practice_id
      if coverage_version && coverage_version.site_id != site_id
        errors.add(:coverage_version, "must belong to this location")
      end
      if request_event
        expected = [ site_id, coverage_version_id, invoice_id, insurance_claim_id, kind ]
        actual = [ request_event.site_id, request_event.coverage_version_id, request_event.invoice_id, request_event.insurance_claim_id, request_event.kind ]
        errors.add(:request_event, "must be the matching original preparation") if request_event.request_event_id || actual != expected
        unless prior_event && (prior_event.id == request_event.id || prior_event.request_event_id == request_event.id)
          errors.add(:prior_event, "must belong to this request history")
        end
      end
    end
  end
end
