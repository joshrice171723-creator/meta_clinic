class AddServiceOfferingInstructions < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_service_offerings, :contact_instructions, :text
    add_column :clinic_service_offerings, :referral_instructions, :text
    %w[contact_instructions referral_instructions].each do |field|
      add_check_constraint :clinic_service_offerings,
        "#{field} IS NULL OR char_length(#{field}) <= 500",
        name: "service_offering_#{field}_length"
    end
  end
end
