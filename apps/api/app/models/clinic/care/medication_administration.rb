module Clinic
  module Care
    class MedicationAdministration < ApplicationRecord
      self.table_name = "clinic_medication_administrations"

      include Clinic::TenantScoped

      STATUSES = %w[completed not_done].freeze
      PRECHECK_STATUSES = %w[not_recorded completed not_required unable_to_complete].freeze
      VERIFICATION_STATUSES = %w[not_recorded completed not_required unable_to_complete].freeze
      ADMINISTRATION_SITES = {
        "not_applicable" => "Not applicable", "left_deltoid" => "Left deltoid",
        "right_deltoid" => "Right deltoid", "left_thigh" => "Left thigh", "right_thigh" => "Right thigh",
        "left_gluteal" => "Left gluteal", "right_gluteal" => "Right gluteal", "abdomen" => "Abdomen",
        "other" => "Other documented site"
      }.freeze

      encrypts :dose_text, :route_text, :administration_site_text, :medication_snapshot, :status_reason,
        :variance_reason, :precheck_notes, :response_text, :education_text

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter"
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :administered_by_membership, class_name: "Clinic::Membership"
      belongs_to :verified_by_membership, class_name: "Clinic::Membership", optional: true
      belongs_to :product, class_name: "Clinic::Inventory::PharmacyProduct"
      belongs_to :medication_request_revision, class_name: "Clinic::Care::MedicationRequestRevision", optional: true
      has_many :movement_links, class_name: "Clinic::Care::MedicationAdministrationMovement",
        dependent: :restrict_with_error
      has_many :inventory_entries, through: :movement_links

      attr_readonly :practice_id, :patient_id, :encounter_id, :site_id, :administered_by_membership_id,
        :verified_by_membership_id, :product_id, :medication_request_revision_id, :status, :status_reason,
        :dose_value, :dose_unit_code, :dose_text, :route_code, :route_text, :administration_site_code,
        :administration_site_text, :variance_reason, :precheck_status, :precheck_notes, :verification_status,
        :response_text, :education_text, :medication_snapshot, :quantity, :stock_unit, :administered_at,
        :recorded_at, :request_key, :created_at, :updated_at

      validates :status, inclusion: { in: STATUSES }
      validates :dose_text, presence: true, length: { maximum: 500 }, if: :completed?
      validates :route_text, presence: true, length: { maximum: 160 }, if: :completed?
      validates :administration_site_text, length: { maximum: 160 }, allow_nil: true
      validates :dose_value, numericality: { greater_than: 0, less_than_or_equal_to: 1_000_000 }, if: :completed?
      validates :dose_unit_code, inclusion: { in: MedicationRequestRevision::DOSE_UNITS.keys }, if: :completed?
      validates :route_code, inclusion: { in: MedicationRequestRevision::ROUTES.keys }, if: :completed?
      validates :administration_site_code, inclusion: { in: ADMINISTRATION_SITES.keys }, allow_nil: true
      validates :quantity, numericality: { greater_than: 0, less_than_or_equal_to: 1_000_000 }, if: :completed?
      validates :stock_unit, inclusion: { in: %w[package each tablet capsule vial mL g] }
      validates :status_reason, presence: true, length: { maximum: 2_000 }, if: :not_done?
      validates :status_reason, absence: true, if: :completed?
      validates :variance_reason, :precheck_notes, :response_text, :education_text,
        length: { maximum: 2_000 }, allow_nil: true
      validates :precheck_status, inclusion: { in: PRECHECK_STATUSES }
      validates :verification_status, inclusion: { in: VERIFICATION_STATUSES }
      validates :administered_at, :recorded_at, presence: true
      validates :request_key, presence: true, format: { with: Clinic::Idempotency::KEY_PATTERN },
        uniqueness: { scope: :practice_id }
      validates :medication_snapshot, presence: true
      validate :clinical_context_is_consistent
      validate :product_is_medication
      validate :medication_snapshot_is_consistent
      validate :administration_timeline_is_valid
      validate :order_context_is_consistent
      validate :outcome_is_consistent
      validate :verification_is_consistent

      before_validation :normalize_clinical_text
      before_update { throw :abort }
      before_destroy { throw :abort }

      def medication_identity
        JSON.parse(medication_snapshot.to_s).symbolize_keys
      rescue JSON::ParserError, TypeError
        raise ArgumentError, "Stored medication identity is unavailable."
      end

      def medication_identity=(identity)
        self.medication_snapshot = JSON.generate(identity)
      end

      def completed? = status == "completed"
      def not_done? = status == "not_done"

      private

      def normalize_clinical_text
        self.dose_text = dose_text.to_s.strip if dose_text.present?
        self.route_text = route_text.to_s.strip if route_text.present?
        self.administration_site_text = administration_site_text.to_s.strip.presence unless administration_site_text.nil?
        self.status_reason = status_reason.to_s.strip.presence unless status_reason.nil?
        self.variance_reason = variance_reason.to_s.strip.presence unless variance_reason.nil?
        self.precheck_notes = precheck_notes.to_s.strip.presence unless precheck_notes.nil?
        self.response_text = response_text.to_s.strip.presence unless response_text.nil?
        self.education_text = education_text.to_s.strip.presence unless education_text.nil?
      end

      def clinical_context_is_consistent
        { patient: patient, encounter: encounter, site: site,
          administered_by_membership: administered_by_membership, verified_by_membership: verified_by_membership,
          product: product, medication_request_revision: medication_request_revision }.compact.each do |attribute, record|
          errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
        end
        errors.add(:encounter, "must belong to this patient") if encounter && encounter.patient_id != patient_id
        errors.add(:site, "must match the encounter facility") if encounter && encounter.site_id != site_id
        errors.add(:stock_unit, "must match the medication inventory unit") if product && stock_unit != product.stock_unit
      end


      def order_context_is_consistent
        return unless medication_request_revision

        request = medication_request_revision
        expected = [ practice_id, patient_id, encounter_id, site_id, product_id ]
        actual = [ request.practice_id, request.patient_id, request.encounter_id, request.site_id,
          request.inventory_product_id ]
        errors.add(:medication_request_revision, "must match this administration") unless actual == expected
      end

      def outcome_is_consistent
        if completed?
          errors.add(:precheck_status, "must be recorded") if precheck_status == "not_recorded"
          errors.add(:verification_status, "must be recorded") if verification_status == "not_recorded"
        else
          errors.add(:quantity, "must be blank when medication was not given") if quantity.present?
          errors.add(:dose_value, "must be blank when medication was not given") if dose_value.present?
          errors.add(:dose_unit_code, "must be blank when medication was not given") if dose_unit_code.present?
          errors.add(:route_code, "must be blank when medication was not given") if route_code.present?
        end
      end

      def verification_is_consistent
        if verification_status == "completed"
          errors.add(:verified_by_membership, "is required when verification is completed") unless verified_by_membership
          if verified_by_membership_id == administered_by_membership_id
            errors.add(:verified_by_membership, "must be a different staff member")
          end
        elsif verified_by_membership
          errors.add(:verified_by_membership, "must be blank unless verification is completed")
        end
        if verification_status == "unable_to_complete" && variance_reason.blank?
          errors.add(:variance_reason, "is required when verification could not be completed")
        end
        if precheck_status == "unable_to_complete" && variance_reason.blank?
          errors.add(:variance_reason, "is required when the medication pre-check could not be completed")
        end
      end

      def product_is_medication
        errors.add(:product, "must be an active medication") if product && (product.category != "medication" || !product.active?)
      end

      def medication_snapshot_is_consistent
        return if medication_snapshot.blank?

        identity = medication_identity
        expected = { version: 1, practice_id: practice_id, product_id: product_id, request_key: request_key,
          stock_unit: stock_unit }
        errors.add(:medication_snapshot, "does not match this administration") unless identity.slice(*expected.keys) == expected
        errors.add(:medication_snapshot, "must include the recorded medication name") if identity[:name].to_s.strip.empty?
      rescue ArgumentError
        errors.add(:medication_snapshot, "is invalid")
      end

      def administration_timeline_is_valid
        return unless administered_at && recorded_at

        errors.add(:administered_at, "cannot be after it was recorded") if administered_at > recorded_at
        errors.add(:administered_at, "cannot precede the encounter") if encounter&.started_at && administered_at < encounter.started_at
        errors.add(:administered_at, "cannot be after the encounter ended") if encounter&.ended_at && administered_at > encounter.ended_at
      end
    end
  end
end
