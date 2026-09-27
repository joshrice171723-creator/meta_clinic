class AddFollowUpToServiceInquiries < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_service_inquiries, :follow_up_on, :date
    add_column :clinic_service_inquiries, :follow_up_note, :text
    add_index :clinic_service_inquiries, %i[practice_id follow_up_on id],
      where: "status <> 'closed' AND follow_up_on IS NOT NULL",
      name: "clinic_service_inquiries_follow_up"
    add_check_constraint :clinic_service_inquiries,
      "status <> 'closed' OR follow_up_on IS NULL",
      name: "clinic_service_inquiries_closed_follow_up"
  end
end
