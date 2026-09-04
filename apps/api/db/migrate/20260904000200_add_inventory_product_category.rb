class AddInventoryProductCategory < ActiveRecord::Migration[8.1]
  CATEGORIES = %w[medication clinical_supply lab_supply office_supply cleaning_supply equipment other].freeze

  def change
    add_column :clinic_pharmacy_products, :category, :string, null: false, default: "medication"
    add_check_constraint :clinic_pharmacy_products,
      "category IN ('medication','clinical_supply','lab_supply','office_supply','cleaning_supply','equipment','other')",
      name: "pharmacy_product_category"
  end
end
