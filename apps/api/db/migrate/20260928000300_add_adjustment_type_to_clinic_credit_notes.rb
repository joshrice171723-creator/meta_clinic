class AddAdjustmentTypeToClinicCreditNotes < ActiveRecord::Migration[8.0]
  def change
    add_column :clinic_credit_notes, :adjustment_type, :string, null: false, default: "credit"
    add_check_constraint :clinic_credit_notes,
      "adjustment_type IN ('credit', 'write_off')",
      name: "clinic_credit_notes_adjustment_type"
  end
end
