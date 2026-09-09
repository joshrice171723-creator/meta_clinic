class HardenCollectionMoneyAndInvoiceStatus < ActiveRecord::Migration[8.1]
  def up
    remove_check_constraint :clinic_cash_tenders, name: "cash_tender_amounts"
    add_check_constraint :clinic_cash_tenders, <<~SQL.squish, name: "cash_tender_amounts"
      tendered_amount > 0
      AND tendered_amount = round(tendered_amount, 2)
      AND change_amount >= 0
      AND change_amount = round(change_amount, 2)
      AND change_amount < tendered_amount
    SQL

    remove_check_constraint :clinic_payment_allocations, name: "clinic_payment_allocations_amount"
    add_check_constraint :clinic_payment_allocations,
      "amount > 0 AND amount = round(amount, 2)",
      name: "clinic_payment_allocations_amount"

    remove_check_constraint :clinic_refund_events, name: "clinic_refund_events_values"
    add_check_constraint :clinic_refund_events, <<~SQL.squish, name: "clinic_refund_events_values"
      currency ~ '^[A-Z]{3}$'
      AND amount > 0
      AND amount = round(amount, 2)
    SQL

    remove_check_constraint :clinic_payment_collection_intents, name: "payment_collection_intents_values"
    add_check_constraint :clinic_payment_collection_intents, <<~SQL.squish, name: "payment_collection_intents_values"
      reference ~ '^ci_[a-f0-9]{32}$'
      AND request_key ~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$'
      AND processor ~ '^[a-z][a-z0-9_.-]{0,39}$'
      AND mode IN ('test', 'live')
      AND currency ~ '^[A-Z]{3}$'
      AND amount > 0
      AND amount = round(amount, 2)
      AND state IN ('pending', 'processing', 'succeeded', 'failed', 'needs_reconciliation', 'canceled')
    SQL

    remove_check_constraint :clinic_invoices, name: "clinic_invoices_values"
    add_check_constraint :clinic_invoices, <<~SQL.squish, name: "clinic_invoices_values"
      currency ~ '^[A-Z]{3}$'
      AND status IN ('draft', 'posted', 'void')
      AND length(trim(status)) > 0
      AND length(trim(rounding_policy_version)) > 0
    SQL

    execute <<~SQL
      CREATE FUNCTION clinic_enforce_invoice_status_transition()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        IF OLD.status = NEW.status
          OR (OLD.status = 'draft' AND NEW.status = 'posted')
          OR (OLD.status = 'posted' AND NEW.status = 'void') THEN
          RETURN NEW;
        END IF;

        RAISE EXCEPTION 'invalid clinic invoice status transition from % to %', OLD.status, NEW.status
          USING ERRCODE = 'check_violation';
      END;
      $function$;

      CREATE TRIGGER clinic_invoices_status_transition
      BEFORE UPDATE OF status ON clinic_invoices
      FOR EACH ROW
      EXECUTE FUNCTION clinic_enforce_invoice_status_transition();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Financial precision and invoice-transition safeguards cannot be safely removed."
  end
end
