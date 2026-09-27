class AddPublicClinicPageCopy < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_practices, :public_page_headline, :string, limit: 160
    add_column :clinic_practices, :public_page_intro, :text
    add_check_constraint :clinic_practices,
      "public_page_intro IS NULL OR char_length(public_page_intro) <= 500",
      name: "clinic_practices_public_page_intro_length"
  end
end
