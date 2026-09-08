class AddInventoryTransferPermission < ActiveRecord::Migration[8.1]
  def up
    return if column_exists?(:clinic_memberships, :inventory_transfer)

    add_column :clinic_memberships, :inventory_transfer, :boolean, null: false, default: false
    execute <<~SQL
      UPDATE clinic_memberships
      SET inventory_transfer = inventory_access
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Preserve inventory permission history; restore a matched verified backup for rollback."
  end
end
