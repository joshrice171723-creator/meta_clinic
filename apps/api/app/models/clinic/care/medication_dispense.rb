module Clinic
  module Care
    class MedicationDispense < ApplicationRecord
      self.table_name = "clinic_medication_dispenses"
      include Clinic::TenantScoped
      include Clinic::Auditable
      belongs_to :medication_request_revision, class_name: "Clinic::Care::MedicationRequestRevision"
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership"
      belongs_to :inventory_entry, class_name: "Clinic::Inventory::Entry", optional: true
      belongs_to :original_dispense, class_name: name, optional: true
      encrypts :reason
      validates :status, inclusion: { in: %w[handed_over reversed not_done] }
      validates :reason, length: { maximum: 2000 }
      validates :request_key, :handed_over_at, :recorded_at, :stock_unit, presence: true
      validate do
        order = medication_request_revision
        unless order && [order.practice_id, order.patient_id, order.encounter_id, order.site_id] == [practice_id, patient_id, encounter_id, site_id] && recorded_by_membership&.practice_id == practice_id
          errors.add(:base, "Dispense context mismatch")
        end
        errors.add(:inventory_entry, "must belong to this practice") if inventory_entry && inventory_entry.practice_id != practice_id
        if inventory_entry && (inventory_entry.quantity != -quantity || inventory_entry.stock_unit != stock_unit || inventory_entry.batch&.product_id != order&.inventory_product_id)
          errors.add(:inventory_entry, "must match the handover quantity, unit and medication")
        end
        if original_dispense && (original_dispense.practice_id != practice_id || original_dispense.patient_id != patient_id ||
            original_dispense.medication_request_revision.series_id != order&.series_id || quantity != -original_dispense.quantity)
          errors.add(:original_dispense, "must identify the exact handover being reversed")
        end
      end
      before_update { throw :abort }
      before_destroy { throw :abort }
    end
  end
end
