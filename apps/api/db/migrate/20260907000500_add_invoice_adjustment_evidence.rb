class AddInvoiceAdjustmentEvidence < ActiveRecord::Migration[8.0]
  def change
    add_column :clinic_credit_notes, :reason, :text
    add_column :clinic_credit_notes, :issued_by_membership_id, :bigint
    add_column :clinic_credit_notes, :issued_at, :datetime, precision: 6
    add_index :clinic_credit_notes, [ :practice_id, :issued_by_membership_id ],
      name: "index_credit_notes_on_practice_and_issuer"
    add_foreign_key :clinic_credit_notes, :clinic_memberships,
      column: [ :practice_id, :issued_by_membership_id ], primary_key: [ :practice_id, :id ],
      name: "fk_credit_notes_issuer_membership"
    add_check_constraint :clinic_credit_notes, <<~SQL.squish, name: "clinic_credit_notes_evidence_shape"
      (reason IS NULL AND issued_by_membership_id IS NULL AND issued_at IS NULL)
      OR
      (reason IS NOT NULL AND issued_by_membership_id IS NOT NULL AND issued_at IS NOT NULL)
    SQL

    add_column :clinic_invoices, :void_reason, :text
    add_column :clinic_invoices, :voided_by_membership_id, :bigint
    add_column :clinic_invoices, :voided_at, :datetime, precision: 6
    add_index :clinic_invoices, [ :practice_id, :voided_by_membership_id ],
      name: "index_invoices_on_practice_and_voider"
    add_foreign_key :clinic_invoices, :clinic_memberships,
      column: [ :practice_id, :voided_by_membership_id ], primary_key: [ :practice_id, :id ],
      name: "fk_invoices_voider_membership"
    add_check_constraint :clinic_invoices, <<~SQL.squish, name: "clinic_invoices_void_evidence_shape"
      (void_reason IS NULL AND voided_by_membership_id IS NULL AND voided_at IS NULL)
      OR
      (void_reason IS NOT NULL AND voided_by_membership_id IS NOT NULL AND voided_at IS NOT NULL)
    SQL
  end
end
