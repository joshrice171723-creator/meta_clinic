class ClarifyPackageUnits < ActiveRecord::Migration[8.1]
  def change
    add_check_constraint :clinic_pharmacy_products, "stock_unit <> 'package' OR package_size = 1", name: "inventory_package_unit"
  end
end
