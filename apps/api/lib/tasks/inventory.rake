namespace :inventory do
  desc "Read-only stock reconciliation (prints counts, never record contents)"
  task verify: :environment do
    connection = ApplicationRecord.connection
    raise "PostgreSQL required" unless connection.adapter_name == "PostgreSQL"
    discrepancies = connection.select_value(<<~SQL)
      SELECT COUNT(*) FROM (
        SELECT b.id FROM clinic_pharmacy_batches b LEFT JOIN clinic_inventory_entries e ON e.batch_id=b.id GROUP BY b.id HAVING b.on_hand<>COALESCE(SUM(e.quantity),0)
        UNION ALL
        SELECT i.id FROM clinic_items i LEFT JOIN clinic_inventory_entries e ON e.item_id=i.id GROUP BY i.id HAVING i.quantity<>COALESCE(SUM(e.quantity),0)
        UNION ALL
        SELECT l.id FROM clinic_inventory_receipt_lines l LEFT JOIN clinic_inventory_entries e ON e.receipt_line_id=l.id WHERE e.id IS NULL
      ) discrepancies
    SQL
    abort "Inventory reconciliation failed; #{discrepancies} discrepancies. Details suppressed." unless discrepancies.zero?
    puts "Inventory balances and receipt postings reconcile."
  end
end
