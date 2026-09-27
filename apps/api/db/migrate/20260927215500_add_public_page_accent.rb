class AddPublicPageAccent < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_practices, :public_page_accent, :string, limit: 7
    add_check_constraint :clinic_practices,
      "public_page_accent IS NULL OR public_page_accent IN ('#155e75', '#6d28d9', '#166534')",
      name: "clinic_practices_public_page_accent_palette"
  end
end
