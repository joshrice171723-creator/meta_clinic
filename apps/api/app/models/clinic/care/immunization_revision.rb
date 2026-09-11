module Clinic
  module Care
    class ImmunizationRevision < ApplicationRecord
      self.table_name = "clinic_immunization_revisions"
      include Clinic::ClinicalRevision

      STATUSES = %w[planned completed not_done entered_in_error].freeze
      OCCURRENCE_SOURCES = %w[administered_here patient_reported external_record registry].freeze

      belongs_to :prior_revision, class_name: name, optional: true
      belongs_to :source_document, class_name: "Clinic::Document", optional: true
      belongs_to :medication_administration, class_name: "Clinic::Care::MedicationAdministration", optional: true

      encrypts :vaccine_name, :cvx_code, :manufacturer, :lot_number, :dose_text, :route_text,
        :administration_site_text, :refusal_reason
      validates :status, inclusion: { in: STATUSES }
      validates :occurrence_source, inclusion: { in: OCCURRENCE_SOURCES }
      validates :vaccine_name, presence: true, length: { maximum: 500 }
      validates :cvx_code, :manufacturer, :lot_number, :dose_text, :route_text,
        :administration_site_text, length: { maximum: 500 }, allow_nil: true
      validates :refusal_reason, length: { maximum: 2_000 }, allow_nil: true
      validate :status_evidence
      validate :source_document_matches
      validate :administration_matches

      private

      def status_evidence
        errors.add(:administered_at, "is required for completed immunizations") if status == "completed" && administered_at.nil?
        errors.add(:refusal_reason, "is required when an immunization was not given") if status == "not_done" && refusal_reason.blank?
        if status == "completed" && occurrence_source == "administered_here" && medication_administration.nil?
          errors.add(:medication_administration, "is required for an immunization administered here")
        end
      end

      def source_document_matches
        return unless source_document
        errors.add(:source_document, "must belong to this patient") unless
          [ source_document.practice_id, source_document.patient_id ] == [ practice_id, patient_id ]
      end

      def administration_matches
        return unless medication_administration
        expected = [ practice_id, patient_id, encounter_id, site_id, "completed" ]
        actual = [ medication_administration.practice_id, medication_administration.patient_id,
          medication_administration.encounter_id, medication_administration.site_id, medication_administration.status ]
        errors.add(:medication_administration, "must be a completed administration for this visit") unless actual == expected
      end
    end
  end
end
