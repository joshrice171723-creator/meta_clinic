class AddPublicVisibilityToClinicServiceOfferings < ActiveRecord::Migration[8.0]
  def change
    add_column :clinic_service_offerings, :public_visible, :boolean, null: false, default: false
    add_index :clinic_service_offerings, [ :practice_id, :status, :public_visible ],
      name: "clinic_service_offerings_public_catalog"
  end
end
