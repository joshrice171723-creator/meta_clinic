class AllowPlatformManagedClinicAccess < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_practices, :platform_managed, :boolean, null: false, default: false
    add_index :clinic_practices, :platform_managed,
      where: "platform_managed = TRUE", name: "clinic_practices_platform_managed"
  end
end
