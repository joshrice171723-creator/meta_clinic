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
        if medication_administration && occurrence_source != "administered_here"
          errors.add(:medication_administration, "must be blank unless the occurrence source is administered_here")
        end
        if status == "completed"
          errors.add(:administered_at, "is required for completed immunizations") if administered_at.nil?
          errors.add(:cvx_code, "is required for completed immunizations") if cvx_code.blank?
          if occurrence_source == "administered_here"
            errors.add(:medication_administration, "is required for an immunization administered here") if medication_administration.nil?
            errors.add(:lot_number, "is required for an immunization administered here") if lot_number.blank?
          end
        elsif status == "not_done"
          errors.add(:cvx_code, "is required when an immunization was not given") if cvx_code.blank?
          errors.add(:refusal_reason, "is required when an immunization was not given") if refusal_reason.blank?
          errors.add(:medication_administration, "must be blank when an immunization was not given") if medication_administration
        elsif status == "planned"
          errors.add(:refusal_reason, "must be blank for a planned immunization") if refusal_reason.present?
          errors.add(:medication_administration, "must be blank for a planned immunization") if medication_administration
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
        if actual == expected && !medication_administration.movement_links.exists?
          errors.add(:medication_administration, "must have a linked inventory movement")
        end
        return unless actual == expected && lot_number.present?

        lot_numbers = medication_administration.movement_links.includes(:inventory_entry).filter_map do |link|
          link.stock_identity[:lot_number]
        rescue ArgumentError
          nil
        end
        if lot_numbers.any? && !lot_numbers.include?(lot_number)
          errors.add(:lot_number, "must match a lot used by the linked administration")
        end
      end
    end
  end
end
