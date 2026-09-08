class SnapshotMedicationAdministrationIdentity < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_medication_administrations, :medication_snapshot, :text
    add_column :clinic_medication_administration_movements, :stock_snapshot, :text
  end
end
