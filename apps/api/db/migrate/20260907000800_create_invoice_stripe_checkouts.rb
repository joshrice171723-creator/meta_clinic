class CreateInvoiceStripeCheckouts < ActiveRecord::Migration[8.1]
  def up
    create_table :clinic_invoice_stripe_checkouts do |t|
      t.bigint :practice_id, null: false
      t.bigint :connection_id, null: false
      t.bigint :invoice_id, null: false
      t.bigint :collection_intent_id, null: false
      t.string :account_id, null: false
      t.string :session_id
      t.string :session_status
      t.integer :application_fee_cents, null: false
      t.timestamps
    end

    add_index :clinic_invoice_stripe_checkouts, [ :practice_id, :id ], unique: true
    add_index :clinic_invoice_stripe_checkouts, :collection_intent_id, unique: true
    add_index :clinic_invoice_stripe_checkouts, [ :account_id, :session_id ], unique: true
    add_index :clinic_invoice_stripe_checkouts, [ :practice_id, :invoice_id ]
    add_foreign_key :clinic_invoice_stripe_checkouts, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_invoice_stripe_checkouts, :clinic_stripe_connections,
      column: [ :practice_id, :connection_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_invoice_stripe_checkouts, :clinic_invoices,
      column: [ :practice_id, :invoice_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_invoice_stripe_checkouts, :clinic_payment_collection_intents,
      column: [ :practice_id, :collection_intent_id ], primary_key: [ :practice_id, :id ]
    add_check_constraint :clinic_invoice_stripe_checkouts,
      "account_id ~ '^acct_[a-zA-Z0-9]+$' AND application_fee_cents >= 0 AND (session_id IS NULL OR session_id ~ '^cs_test_[a-zA-Z0-9]+$') AND (session_status IS NULL OR session_status IN ('open', 'complete', 'expired'))",
      name: "invoice_stripe_checkouts_values"

    remove_check_constraint :clinic_billing_receipts, name: "billing_receipt_kind"
    add_check_constraint :clinic_billing_receipts,
      "kind IN ('cash_payment', 'cash_refund', 'subscription_payment', 'subscription_refund', 'card_payment')",
      name: "billing_receipt_kind"

    execute <<~SQL
      CREATE FUNCTION guard_invoice_stripe_checkout_routing() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Invoice Stripe checkout history cannot be deleted'; END IF;
        IF (to_jsonb(OLD) - ARRAY['updated_at','session_id','session_status']) <>
           (to_jsonb(NEW) - ARRAY['updated_at','session_id','session_status']) OR
           (OLD.session_id IS NOT NULL AND OLD.session_id IS DISTINCT FROM NEW.session_id) THEN
          RAISE EXCEPTION 'Invoice Stripe checkout routing cannot be changed';
        END IF;
        RETURN NEW;
      END; $$;
      CREATE TRIGGER invoice_stripe_checkout_routing
        BEFORE UPDATE OR DELETE ON clinic_invoice_stripe_checkouts
        FOR EACH ROW EXECUTE FUNCTION guard_invoice_stripe_checkout_routing();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Preserve invoice payment routing history."
  end
end
