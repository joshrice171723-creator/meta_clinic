class AddStripeConnectSandbox < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_stripe_connections do |t|
      t.bigint :practice_id, null: false
      t.references :connected_by, null: false, foreign_key: { to_table: :users }
      t.string :reference, null: false
      t.string :account_id
      t.boolean :charges_enabled, null: false, default: false
      t.boolean :payouts_enabled, null: false, default: false
      t.timestamps
    end
    add_foreign_key :clinic_stripe_connections, :clinic_practices, column: :practice_id
    add_index :clinic_stripe_connections, :practice_id, unique: true
    add_index :clinic_stripe_connections, :reference, unique: true
    add_index :clinic_stripe_connections, :account_id, unique: true
    add_index :clinic_stripe_connections, [:practice_id, :id], unique: true

    create_table :clinic_stripe_checkouts do |t|
      t.bigint :practice_id, null: false
      t.bigint :connection_id, null: false
      t.bigint :agreement_id, null: false
      t.bigint :collection_intent_id, null: false
      t.string :account_id, null: false
      t.string :session_id
      t.integer :application_fee_cents, null: false
      t.timestamps
    end
    add_foreign_key :clinic_stripe_checkouts, :clinic_practices, column: :practice_id
    { connection_id: :clinic_stripe_connections, agreement_id: :clinic_subscription_agreements,
      collection_intent_id: :clinic_payment_collection_intents }.each do |column, target|
      add_foreign_key :clinic_stripe_checkouts, target, column: [:practice_id, column], primary_key: [:practice_id, :id]
    end
    add_index :clinic_stripe_checkouts, :collection_intent_id, unique: true
    add_index :clinic_stripe_checkouts, [:account_id, :session_id], unique: true
    add_check_constraint :clinic_stripe_checkouts, "application_fee_cents >= 0", name: "stripe_checkout_fee_nonnegative"
    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE FUNCTION guard_stripe_routing() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Stripe routing history cannot be deleted'; END IF;
            IF TG_TABLE_NAME = 'clinic_stripe_connections' THEN
              IF OLD.practice_id <> NEW.practice_id OR OLD.reference <> NEW.reference OR
                (OLD.account_id IS NOT NULL AND OLD.account_id IS DISTINCT FROM NEW.account_id) THEN
                RAISE EXCEPTION 'Stripe clinic routing cannot be changed';
              END IF;
            ELSE
              IF (to_jsonb(OLD) - 'updated_at' - 'session_id') <> (to_jsonb(NEW) - 'updated_at' - 'session_id') OR
                (OLD.session_id IS NOT NULL AND OLD.session_id IS DISTINCT FROM NEW.session_id) THEN
                RAISE EXCEPTION 'Stripe checkout terms cannot be changed';
              END IF;
            END IF;
            RETURN NEW;
          END; $$;
          CREATE TRIGGER stripe_connection_routing BEFORE UPDATE OR DELETE ON clinic_stripe_connections
            FOR EACH ROW EXECUTE FUNCTION guard_stripe_routing();
          CREATE TRIGGER stripe_checkout_routing BEFORE UPDATE OR DELETE ON clinic_stripe_checkouts
            FOR EACH ROW EXECUTE FUNCTION guard_stripe_routing();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER stripe_checkout_routing ON clinic_stripe_checkouts"
        execute "DROP TRIGGER stripe_connection_routing ON clinic_stripe_connections"
        execute "DROP FUNCTION guard_stripe_routing()"
      end
    end
  end
end
