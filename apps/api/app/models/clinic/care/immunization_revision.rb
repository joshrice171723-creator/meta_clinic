module Clinic
  module Care
    class ImmunizationRevision < ApplicationRecord
      self.table_name = "clinic_immunization_revisions"
      include Clinic::ClinicalRevision

      STATUSES = %w[planned completed not_done entered_in_error].freeze
      OCCURRENCE_SOURCES = %w[administered_here patient_reported external_record registry].freeze
      CVX_CODE_PATTERN = /\A\d{1,3}\z/
      MVX_CODE_PATTERN = /\A[A-Z0-9]{2,3}\z/

      belongs_to :prior_revision, class_name: name, optional: true
      belongs_to :source_document, class_name: "Clinic::Document", optional: true
      belongs_to :medication_administration, class_name: "Clinic::Care::MedicationAdministration", optional: true

      encrypts :vaccine_name, :cvx_code, :manufacturer, :manufacturer_mvx_code, :lot_number, :dose_text,
        :route_text, :administration_site_text, :refusal_reason
      validates :status, inclusion: { in: STATUSES }
      validates :occurrence_source, inclusion: { in: OCCURRENCE_SOURCES }
      validates :vaccine_name, presence: true, length: { maximum: 500 }
      validates :cvx_code, :manufacturer, :lot_number, :dose_text, :route_text,
        :administration_site_text, length: { maximum: 500 }, allow_nil: true
      validates :cvx_code, format: { with: CVX_CODE_PATTERN, message: "must use one to three digits" }, allow_nil: true
      validates :manufacturer_mvx_code, length: { maximum: 3 },
        format: { with: MVX_CODE_PATTERN, message: "must use two or three letters or digits" }, allow_nil: true
      validates :refusal_reason, length: { maximum: 2_000 }, allow_nil: true
      validate :status_evidence
      validate :source_document_matches
      validate :administration_matches
      before_validation :normalize_codes

      private

      def normalize_codes
        self.cvx_code = cvx_code.to_s.strip.presence unless cvx_code.nil?
        self.manufacturer_mvx_code = manufacturer_mvx_code.to_s.strip.upcase.presence unless manufacturer_mvx_code.nil?
      end

      def status_evidence
        return if status == "entered_in_error"

        if source_document && !occurrence_source.in?(%w[external_record registry])
          errors.add(:source_document, "is only supported for an external or registry record")
        end
        if manufacturer_mvx_code.present? && manufacturer.blank?
          errors.add(:manufacturer_mvx_code, "requires the manufacturer name")
        end
        if medication_administration && occurrence_source != "administered_here"
          errors.add(:medication_administration, "must be blank unless the occurrence source is administered_here")
        end
        if status == "completed"
          errors.add(:administered_at, "is required for completed immunizations") if administered_at.nil?
          errors.add(:cvx_code, "is required for completed immunizations") if cvx_code.blank?
          if occurrence_source == "administered_here"
            errors.add(:medication_administration, "is required for an immunization administered here") if medication_administration.nil?
            errors.add(:manufacturer, "is required for an immunization administered here") if manufacturer.blank?
            errors.add(:lot_number, "is required for an immunization administered here") if lot_number.blank?
            errors.add(:lot_expiration_date, "is required for an immunization administered here") if lot_expiration_date.nil?
          end
        elsif status == "not_done"
          errors.add(:cvx_code, "is required when an immunization was not given") if cvx_code.blank?
          errors.add(:refusal_reason, "is required when an immunization was not given") if refusal_reason.blank?
          errors.add(:medication_administration, "must be blank when an immunization was not given") if medication_administration
          errors.add(:administered_at, "must be blank when an immunization was not given") if administered_at
          errors.add(:lot_number, "must be blank when an immunization was not given") if lot_number.present?
          errors.add(:lot_expiration_date, "must be blank when an immunization was not given") if lot_expiration_date
        elsif status == "planned"
          errors.add(:refusal_reason, "must be blank for a planned immunization") if refusal_reason.present?
          errors.add(:medication_administration, "must be blank for a planned immunization") if medication_administration
          errors.add(:administered_at, "must be blank for a planned immunization") if administered_at
          errors.add(:lot_number, "must be blank for a planned immunization") if lot_number.present?
          errors.add(:lot_expiration_date, "must be blank for a planned immunization") if lot_expiration_date
        end

        validate_vis_evidence
        validate_evidence_dates
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
        return unless actual == expected

        if administered_at && administered_at != medication_administration.administered_at
          errors.add(:administered_at, "must match the linked administration")
        end
        stock = medication_administration.movement_links.includes(:inventory_entry).filter_map do |link|
          identity = link.stock_identity
          [ identity[:lot_number].to_s, Date.iso8601(identity[:expires_on].to_s) ]
        rescue ArgumentError, Date::Error
          nil
        end.uniq
        unless stock.one?
          errors.add(:medication_administration, "must resolve to exactly one inventory lot")
          return
        end

        stock_lot_number, stock_expiration = stock.sole
        errors.add(:lot_number, "must match the linked inventory lot") if lot_number != stock_lot_number
        errors.add(:lot_expiration_date, "must match the linked inventory lot") if lot_expiration_date != stock_expiration
      end

      def validate_vis_evidence
        dates = [ vis_edition_date, vis_given_date ]
        if dates.one?(&:present?)
          errors.add(:vis_given_date, "and VIS edition date must be recorded together")
        elsif dates.any? && !(status == "completed" && occurrence_source == "administered_here")
          errors.add(:vis_given_date, "is only supported for an immunization administered here")
        end
      end

      def validate_evidence_dates
        return unless administered_at

        administration_date = administered_at.to_date
        if lot_expiration_date && lot_expiration_date < administration_date
          errors.add(:lot_expiration_date, "cannot precede administration")
        end
        if vis_edition_date && vis_given_date
          errors.add(:vis_edition_date, "cannot be after the VIS was given") if vis_edition_date > vis_given_date
          errors.add(:vis_given_date, "cannot be after administration") if vis_given_date > administration_date
        end
      end
    end
  end
end
