class AddPublicPageLogo < ActiveRecord::Migration[8.0]
  def change
    add_column :clinic_practices, :public_page_logo_data, :binary
    add_column :clinic_practices, :public_page_logo_content_type, :string
  end
end
