class LinkInvoicesToEncounters < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_invoices, :encounter_id, :bigint

    add_foreign_key :clinic_invoices, :clinic_encounters,
      column: %i[practice_id patient_id encounter_id],
      primary_key: %i[practice_id patient_id id],
      name: "fk_invoices_checkout_encounter"

    add_index :clinic_invoices, %i[practice_id encounter_id],
      unique: true,
      where: "encounter_id IS NOT NULL AND status <> 'void'",
      name: "clinic_invoices_one_active_per_encounter"
  end
end
