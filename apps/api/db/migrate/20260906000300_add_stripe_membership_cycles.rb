class AddStripeMembershipCycles < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_stripe_checkouts, :subscription_id, :string
    add_column :clinic_stripe_checkouts, :subscription_status, :string
    add_column :clinic_stripe_checkouts, :cancel_at_period_end, :boolean, null: false, default: false
    add_column :clinic_stripe_checkouts, :last_synced_at, :datetime
    add_index :clinic_stripe_checkouts, [:account_id, :subscription_id], unique: true
    create_table :clinic_stripe_membership_cycles do |t|
      t.bigint :practice_id, null: false
      t.bigint :checkout_id, null: false
      t.bigint :invoice_id, null: false
      t.string :provider_invoice_id, null: false
      t.string :provider_payment_id, null: false
      t.datetime :period_start, null: false
      t.datetime :period_end, null: false
      t.timestamps
    end
    add_index :clinic_stripe_checkouts, [:practice_id, :id], unique: true
    add_foreign_key :clinic_stripe_membership_cycles, :clinic_stripe_checkouts, column: [:practice_id, :checkout_id], primary_key: [:practice_id, :id]
    add_foreign_key :clinic_stripe_membership_cycles, :clinic_invoices, column: [:practice_id, :invoice_id], primary_key: [:practice_id, :id]
    add_index :clinic_stripe_membership_cycles, [:checkout_id, :provider_invoice_id], unique: true, name: "stripe_cycle_provider_identity"
    add_check_constraint :clinic_stripe_membership_cycles, "period_end > period_start", name: "stripe_cycle_period"
    execute "CREATE TRIGGER stripe_cycles_immutable BEFORE UPDATE OR DELETE ON clinic_stripe_membership_cycles FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()"
    execute <<~SQL
      CREATE OR REPLACE FUNCTION guard_stripe_routing() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Stripe routing history cannot be deleted'; END IF;
        IF TG_TABLE_NAME = 'clinic_stripe_connections' THEN
          IF OLD.practice_id <> NEW.practice_id OR OLD.reference <> NEW.reference OR
            (OLD.account_id IS NOT NULL AND OLD.account_id IS DISTINCT FROM NEW.account_id) THEN
            RAISE EXCEPTION 'Stripe clinic routing cannot be changed';
          END IF;
        ELSE
          IF (to_jsonb(OLD) - ARRAY['updated_at','session_id','subscription_id','subscription_status','cancel_at_period_end','last_synced_at']) <>
             (to_jsonb(NEW) - ARRAY['updated_at','session_id','subscription_id','subscription_status','cancel_at_period_end','last_synced_at']) OR
             (OLD.session_id IS NOT NULL AND OLD.session_id IS DISTINCT FROM NEW.session_id) OR
             (OLD.subscription_id IS NOT NULL AND OLD.subscription_id IS DISTINCT FROM NEW.subscription_id) THEN
            RAISE EXCEPTION 'Stripe checkout terms cannot be changed';
          END IF;
        END IF;
        RETURN NEW;
      END; $$;
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Preserve Stripe renewal history; use a forward migration or restore a separate backup."
  end
end
