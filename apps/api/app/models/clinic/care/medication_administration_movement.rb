module Clinic
  module Care
    class MedicationAdministrationMovement < ApplicationRecord
      self.table_name = "clinic_medication_administration_movements"

      include Clinic::TenantScoped

      encrypts :stock_snapshot

      belongs_to :medication_administration, class_name: "Clinic::Care::MedicationAdministration"
      belongs_to :inventory_entry, class_name: "Clinic::Inventory::Entry"

      attr_readonly :practice_id, :medication_administration_id, :inventory_entry_id, :stock_snapshot,
        :created_at, :updated_at

      validates :inventory_entry_id, uniqueness: { scope: :practice_id }
      validates :stock_snapshot, presence: true
      validate :movement_is_exact_medication_deduction
      validate :stock_snapshot_is_consistent

      before_update { throw :abort }
      before_destroy { throw :abort }

      def stock_identity
        JSON.parse(stock_snapshot.to_s).symbolize_keys
      rescue JSON::ParserError, TypeError
        raise ArgumentError, "Stored medication stock identity is unavailable."
      end

      def stock_identity=(identity)
        self.stock_snapshot = JSON.generate(identity)
      end

      private

      def movement_is_exact_medication_deduction
        administration = medication_administration
        movement = inventory_entry
        return unless administration && movement

        errors.add(:medication_administration, "must belong to this practice") if administration.practice_id != practice_id
        errors.add(:inventory_entry, "must belong to this practice") if movement.practice_id != practice_id
        unless movement.stock_type == "pharmacy" && movement.kind == "adjustment_out" && movement.quantity.to_d.negative?
          errors.add(:inventory_entry, "must be an outbound pharmacy movement")
          return
        end

        batch = movement.batch
        errors.add(:inventory_entry, "must use the recorded medication") if batch&.product_id != administration.product_id
        errors.add(:inventory_entry, "must use stock from the encounter facility") if batch&.location_record&.site_id != administration.site_id
      end

      def stock_snapshot_is_consistent
        return if stock_snapshot.blank? || !medication_administration || !inventory_entry

        identity = stock_identity
        expected = { version: 1, practice_id: practice_id,
          medication_administration_id: medication_administration_id,
          inventory_entry_id: inventory_entry_id,
          batch_id: inventory_entry.batch_id,
          site_id: medication_administration.site_id }
        errors.add(:stock_snapshot, "does not match this administration movement") unless identity.slice(*expected.keys) == expected
      rescue ArgumentError
        errors.add(:stock_snapshot, "is invalid")
      end
    end
  end
end
