module Clinic
  module Care
    class MedicationAdministration < ApplicationRecord
      self.table_name = "clinic_medication_administrations"

      include Clinic::TenantScoped

      encrypts :dose_text, :route_text, :administration_site_text, :medication_snapshot

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter"
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :administered_by_membership, class_name: "Clinic::Membership"
      belongs_to :product, class_name: "Clinic::Inventory::PharmacyProduct"
      belongs_to :medication_request, class_name: "Clinic::Care::MedicationRequest", optional: true
      has_many :movement_links, class_name: "Clinic::Care::MedicationAdministrationMovement",
        dependent: :restrict_with_error
      has_many :inventory_entries, through: :movement_links

      attr_readonly :practice_id, :patient_id, :encounter_id, :site_id, :administered_by_membership_id,
        :product_id, :dose_text, :route_text, :administration_site_text, :medication_snapshot, :quantity, :stock_unit,
        :administered_at, :recorded_at, :request_key, :created_at, :updated_at

      validates :dose_text, presence: true, length: { maximum: 500 }
      validates :route_text, presence: true, length: { maximum: 160 }
      validates :administration_site_text, length: { maximum: 160 }, allow_nil: true
      validates :quantity, numericality: { greater_than: 0, less_than_or_equal_to: 1_000_000 }
      validates :stock_unit, inclusion: { in: %w[package each tablet capsule vial mL g] }
      validates :administered_at, :recorded_at, presence: true
      validates :request_key, presence: true, format: { with: Clinic::Idempotency::KEY_PATTERN },
        uniqueness: { scope: :practice_id }
      validates :medication_snapshot, presence: true
      validate :clinical_context_is_consistent
      validate :product_is_medication
      validate :medication_snapshot_is_consistent
      validate :administration_timeline_is_valid
      validate :medication_request_matches_context

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

      private

      def normalize_clinical_text
        self.dose_text = dose_text.to_s.strip if dose_text.present?
        self.route_text = route_text.to_s.strip if route_text.present?
        self.administration_site_text = administration_site_text.to_s.strip.presence unless administration_site_text.nil?
      end

      def clinical_context_is_consistent
        { patient: patient, encounter: encounter, site: site,
          administered_by_membership: administered_by_membership, product: product }.each do |attribute, record|
          errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
        end
        errors.add(:encounter, "must belong to this patient") if encounter && encounter.patient_id != patient_id
        errors.add(:site, "must match the encounter facility") if encounter && encounter.site_id != site_id
        errors.add(:stock_unit, "must match the medication inventory unit") if product && stock_unit != product.stock_unit
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

      def medication_request_matches_context
        return unless medication_request

        valid = medication_request.practice_id == practice_id && medication_request.patient_id == patient_id &&
          medication_request.encounter_id == encounter_id
        errors.add(:medication_request, "must belong to this patient encounter") unless valid
      end
    end
  end
end
