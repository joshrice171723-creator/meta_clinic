class CloseInventoryLocationKinds < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      UPDATE clinic_inventory_locations SET kind = CASE name WHEN 'Quarantine' THEN 'quarantine' WHEN 'Returns Holding' THEN 'returns' WHEN 'Controlled Cabinet' THEN 'controlled' ELSE 'storage' END WHERE kind IS NULL;
      ALTER TABLE clinic_inventory_locations DROP CONSTRAINT IF EXISTS inventory_location_kind;
      ALTER TABLE clinic_inventory_locations ADD CONSTRAINT inventory_location_kind CHECK (kind IN ('storage','quarantine','returns','controlled'));
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Restore inventory location kinds from verified history."
  end
end
