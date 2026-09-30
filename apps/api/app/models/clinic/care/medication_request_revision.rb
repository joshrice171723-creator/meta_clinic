module Clinic
  module Care
    class MedicationRequestRevision < ApplicationRecord
      self.table_name = "clinic_medication_request_revisions"
      include Clinic::ClinicalRevision

      STATUSES = %w[draft authorized on_hold completed cancelled entered_in_error].freeze
      INTENTS = %w[proposal plan order].freeze
      TRANSMISSION_STATES = %w[not_requested pending accepted rejected failed unknown].freeze
      SUBSTITUTION_INSTRUCTIONS = %w[allowed not_allowed].freeze
      DOSE_UNITS = {
        "mg" => "mg", "ug" => "mcg", "g" => "g", "mL" => "mL", "[iU]" => "unit",
        "{tablet}" => "tablet", "{capsule}" => "capsule", "{puff}" => "puff", "{drop}" => "drop"
      }.freeze
      ROUTES = {
        "oral" => "Oral", "intramuscular" => "Intramuscular", "intravenous" => "Intravenous",
        "subcutaneous" => "Subcutaneous", "intradermal" => "Intradermal", "topical" => "Topical",
        "nasal" => "Nasal", "ophthalmic" => "Ophthalmic", "otic" => "Otic", "inhalation" => "Inhalation"
      }.freeze

      belongs_to :prior_revision, class_name: name, optional: true
      belongs_to :source_medication_statement, class_name: "Clinic::Care::MedicationStatement", optional: true
      belongs_to :inventory_product, class_name: "Clinic::Inventory::PharmacyProduct", optional: true
      belongs_to :requester_membership, class_name: "Clinic::Membership", optional: true

      encrypts :medication_name, :dose_text, :route_text, :frequency_text, :quantity_text, :instructions, :reason_text,
        :completion_exception
      validates :status, inclusion: { in: STATUSES }
      validates :intent, inclusion: { in: INTENTS }
      validates :transmission_state, inclusion: { in: TRANSMISSION_STATES }
      validates :substitution_instruction, inclusion: { in: SUBSTITUTION_INSTRUCTIONS }, allow_nil: true
      validates :medication_name, presence: true, length: { maximum: 400 }
      validates :dose_text, :route_text, :frequency_text, :quantity_text, length: { maximum: 400 }, allow_nil: true
      validates :instructions, :reason_text, length: { maximum: 2_000 }, allow_nil: true
      validates :completion_exception, length: { maximum: 2_000 }, allow_nil: true
      validates :completion_exception, absence: true, unless: -> { status == "completed" }
      validates :dose_value, numericality: { greater_than: 0, less_than_or_equal_to: 1_000_000 }, allow_nil: true
      validates :dose_unit_code, inclusion: { in: DOSE_UNITS.keys }, allow_nil: true
      validates :route_code, inclusion: { in: ROUTES.keys }, allow_nil: true
      validate :source_statement_matches
      validate :inventory_product_matches
      validate :structured_dose_is_complete
      validate :requester_matches
      validate :authorized_inventory_order_is_complete
      encrypts :medication_strength, :medication_form, :medication_code_system, :medication_code,
        :medication_code_version, :catalog_source, :pharmacy_name, :pharmacy_location, :pharmacy_identifier, :duration_text
      validates :fulfillment_route, inclusion: { in: %w[outside_pharmacy take_home administration] }, allow_nil: true
      validates :prescribed_quantity, numericality: { greater_than: 0, less_than_or_equal_to: 1_000_000 }, allow_nil: true
      validates :refills, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 999 }, allow_nil: true
      validates :medication_strength, :medication_form, :medication_code_system, :medication_code,
        :medication_code_version, :catalog_source, :pharmacy_name, :pharmacy_location, :pharmacy_identifier,
        :duration_text, :quantity_unit, length: { maximum: 500 }, allow_nil: true
      validates :refill_of_series_id, format: { with: /\A[0-9a-f-]{36}\z/i }, allow_nil: true

      private

      def source_statement_matches
        return unless source_medication_statement
        expected = [ practice_id, patient_id ]
        actual = [ source_medication_statement.practice_id, source_medication_statement.patient_id ]
        errors.add(:source_medication_statement, "must belong to this patient") unless actual == expected
      end

      def inventory_product_matches
        return unless inventory_product

        errors.add(:inventory_product, "must belong to this clinic") unless inventory_product.practice_id == practice_id
        unless inventory_product.category == "medication" && inventory_product.active?
          errors.add(:inventory_product, "must be an active medication")
        end
      end

      def structured_dose_is_complete
        fields = [ dose_value, dose_unit_code, route_code ]
        return if fields.all?(&:blank?) || fields.none?(&:blank?)

        errors.add(:dose_value, "requires a dose unit and route")
      end

      def requester_matches
        if requester_membership && requester_membership.practice_id != practice_id
          errors.add(:requester_membership, "must belong to this clinic")
        end
      end

      def authorized_inventory_order_is_complete
        return unless status == "authorized" && inventory_product

        errors.add(:requester_membership, "is required for an authorized in-office order") unless requester_membership
        if dose_value.blank? || dose_unit_code.blank? || route_code.blank?
          errors.add(:dose_value, "and a supported unit and route are required for an authorized in-office order")
        end
      end
    end
  end
end
