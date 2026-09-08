class AllowDraftInvoiceLineEdits < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      DROP TRIGGER IF EXISTS clinic_invoice_lines_immutable ON clinic_invoice_lines;

      CREATE FUNCTION clinic_invoice_line_editable_draft() RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
          old_status text;
          new_status text;
        BEGIN
          SELECT status INTO old_status FROM clinic_invoices WHERE id = OLD.invoice_id;
          IF old_status IS DISTINCT FROM 'draft' THEN
            RAISE EXCEPTION 'This record is append-only';
          END IF;

          IF TG_OP = 'UPDATE' THEN
            SELECT status INTO new_status FROM clinic_invoices WHERE id = NEW.invoice_id;
            IF OLD.invoice_id IS DISTINCT FROM NEW.invoice_id OR new_status IS DISTINCT FROM 'draft' THEN
              RAISE EXCEPTION 'This record is append-only';
            END IF;
            RETURN NEW;
          END IF;

          RETURN OLD;
        END;
        $$;

      CREATE TRIGGER clinic_invoice_lines_editable_draft
        BEFORE UPDATE OR DELETE ON clinic_invoice_lines
        FOR EACH ROW EXECUTE FUNCTION clinic_invoice_line_editable_draft();
    SQL
  end

  def down
    execute <<~SQL
      DROP TRIGGER IF EXISTS clinic_invoice_lines_editable_draft ON clinic_invoice_lines;
      DROP FUNCTION IF EXISTS clinic_invoice_line_editable_draft();
      CREATE TRIGGER clinic_invoice_lines_immutable
        BEFORE UPDATE OR DELETE ON clinic_invoice_lines
        FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
    SQL
  end
end
