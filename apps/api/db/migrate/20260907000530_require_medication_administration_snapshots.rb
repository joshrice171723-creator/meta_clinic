class RequireMedicationAdministrationSnapshots < ActiveRecord::Migration[8.1]
  def change
    change_column_null :clinic_medication_administrations, :medication_snapshot, false
    change_column_null :clinic_medication_administration_movements, :stock_snapshot, false
  end
end
