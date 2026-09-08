class UsePurchaseOrderReceiptUnits < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      CREATE OR REPLACE FUNCTION inventory_receipt_check() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        product clinic_pharmacy_products%ROWTYPE;
        receipt clinic_inventory_receipts%ROWTYPE;
        order_line clinic_inventory_purchase_order_lines%ROWTYPE;
        package_factor numeric;
      BEGIN
        SELECT p.* INTO product FROM clinic_pharmacy_products p
          JOIN clinic_pharmacy_batches b ON b.product_id=p.id AND b.practice_id=p.practice_id
          WHERE b.id=NEW.batch_id AND b.practice_id=NEW.practice_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Receipt product must belong to its practice'; END IF;
        SELECT * INTO receipt FROM clinic_inventory_receipts WHERE id=NEW.receipt_id AND practice_id=NEW.practice_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Receipt line must belong to its receipt practice'; END IF;
        package_factor := product.package_size;
        IF NEW.purchase_order_line_id IS NOT NULL OR receipt.purchase_order_id IS NOT NULL THEN
          SELECT * INTO order_line FROM clinic_inventory_purchase_order_lines
            WHERE id=NEW.purchase_order_line_id AND practice_id=NEW.practice_id
              AND purchase_order_id=receipt.purchase_order_id AND product_id=product.id;
          IF NOT FOUND OR order_line.stock_unit IS DISTINCT FROM product.stock_unit
            OR order_line.input_unit IS DISTINCT FROM 'package' OR NEW.input_unit IS DISTINCT FROM 'package'
          THEN RAISE EXCEPTION 'Receipt units and product must match the purchase-order line'; END IF;
          package_factor := order_line.conversion_factor;
        END IF;
        IF NEW.stock_unit<>product.stock_unit OR NEW.quantity<>round(NEW.quantity,product.quantity_scale)
          OR NOT ((NEW.input_unit='package' AND NEW.conversion_factor=package_factor AND NEW.input_quantity=round(NEW.input_quantity,0))
            OR (NEW.input_unit<>'package' AND NEW.input_unit=product.stock_unit AND NEW.conversion_factor=1 AND NEW.input_quantity=round(NEW.input_quantity,product.quantity_scale)))
        THEN RAISE EXCEPTION 'Receipt conversion does not match verified product or purchase-order units'; END IF;
        RETURN NEW;
      END $$;
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Preserve supplier package receipt evidence; restore through a reviewed forward migration."
  end
end
