class AddStripeMembershipRecovery < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_stripe_connections, :last_synced_at, :datetime
    add_column :clinic_stripe_checkouts, :session_status, :string
    add_column :clinic_stripe_checkouts, :renewal_amount_due, :decimal, precision: 14, scale: 2
    add_column :clinic_stripe_checkouts, :renewal_invoice_status, :string
    add_index :clinic_stripe_checkouts, :agreement_id, unique: true
    add_index :clinic_stripe_membership_cycles, [:checkout_id, :provider_payment_id], unique: true, name: "stripe_cycle_payment_identity"
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
          IF (to_jsonb(OLD) - ARRAY['updated_at','session_id','subscription_id','subscription_status','cancel_at_period_end','last_synced_at','session_status','renewal_amount_due','renewal_invoice_status']) <>
             (to_jsonb(NEW) - ARRAY['updated_at','session_id','subscription_id','subscription_status','cancel_at_period_end','last_synced_at','session_status','renewal_amount_due','renewal_invoice_status']) OR
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
    raise ActiveRecord::IrreversibleMigration, "Preserve Stripe payment recovery history."
  end
end
