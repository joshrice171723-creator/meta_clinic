class AddInventoryProcurementReconciliation < ActiveRecord::Migration[8.0]
  def change
    %i[receiving_sessions vendor_returns supplier_credits supplier_invoices].each do |kind|
      table = "clinic_inventory_#{kind}"
      create_table table do |t|
        t.bigint :practice_id, null: false
        t.bigint :purchase_order_id, null: false
        t.bigint :actor_id, null: false
        t.string :reference, null: false, limit: 160
        t.string :reason, null: false, limit: 200
        t.string :request_key, null: false, limit: 36
        t.string :payload_digest, null: false, limit: 64
        t.jsonb :details, null: false, default: {}
        if kind == :vendor_returns
          t.bigint :receipt_line_id, null: false
          t.bigint :entry_id, null: false
          t.decimal :quantity, precision: 20, scale: 6, null: false
        end
        if kind == :supplier_credits
          t.bigint :vendor_return_id, null: false
          t.decimal :amount, precision: 20, scale: 6, null: false
          t.string :currency, null: false, limit: 3
        end
        if kind == :supplier_invoices
          t.string :status, null: false
          t.bigint :supersedes_id
          t.decimal :amount, precision: 20, scale: 6, null: false
          t.string :currency, null: false, limit: 3
        end
        t.timestamps
      end
      add_index table, [:practice_id, :id], unique: true
      add_index table, [:practice_id, :request_key], unique: true
      add_index table, [:practice_id, :purchase_order_id, :id]
      add_foreign_key table, :clinic_practices, column: :practice_id
      add_foreign_key table, :clinic_inventory_purchase_orders, column: [:practice_id, :purchase_order_id], primary_key: [:practice_id, :id]
      add_foreign_key table, :clinic_memberships, column: [:practice_id, :actor_id], primary_key: [:practice_id, :user_id]
      add_check_constraint table, "length(trim(reference)) > 0 AND length(trim(reason)) > 0 AND length(request_key)=36 AND length(payload_digest)=64", name: "#{kind}_input"
      add_check_constraint table, "jsonb_typeof(details)='object' AND octet_length(details::text)<=128000", name: "#{kind}_details"
      reversible do |direction|
        direction.up { execute "CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON #{table} FOR EACH ROW EXECUTE FUNCTION inventory_immutable()" }
        direction.down { execute "DROP TRIGGER immutable_history ON #{table}" }
      end
    end
    add_foreign_key :clinic_inventory_vendor_returns, :clinic_inventory_receipt_lines, column: [:practice_id, :receipt_line_id], primary_key: [:practice_id, :id]
    add_foreign_key :clinic_inventory_vendor_returns, :clinic_inventory_entries, column: [:practice_id, :entry_id], primary_key: [:practice_id, :id]
    add_index :clinic_inventory_vendor_returns, :entry_id, unique: true
    add_check_constraint :clinic_inventory_vendor_returns, "quantity > 0 AND quantity <= 1000000", name: "vendor_return_quantity"
    add_foreign_key :clinic_inventory_supplier_credits, :clinic_inventory_vendor_returns, column: [:practice_id, :vendor_return_id], primary_key: [:practice_id, :id]
    add_check_constraint :clinic_inventory_supplier_credits, "amount > 0 AND currency ~ '^[A-Z]{3}$'", name: "supplier_credit_amount"
    add_index :clinic_inventory_supplier_credits, [:practice_id, :purchase_order_id, :reference], unique: true, name: "supplier_credit_reference"
    add_foreign_key :clinic_inventory_supplier_invoices, :clinic_inventory_supplier_invoices, column: [:practice_id, :supersedes_id], primary_key: [:practice_id, :id]
    add_index :clinic_inventory_supplier_invoices, :supersedes_id, unique: true
    add_index :clinic_inventory_supplier_invoices, [:practice_id, :purchase_order_id, :reference], unique: true, where: "status='matched'", name: "supplier_invoice_matched_reference"
    add_check_constraint :clinic_inventory_supplier_invoices, "amount >= 0 AND currency ~ '^[A-Z]{3}$' AND status IN ('matched','discrepancy')", name: "supplier_invoice_amount"
  end
end
